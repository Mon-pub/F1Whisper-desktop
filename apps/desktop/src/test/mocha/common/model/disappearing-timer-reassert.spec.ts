import {Delayed} from '@threema/ts-utils/delayed/delayed';
import type {u53} from '@threema/ts-utils/integer/u53';
import {dateToUnixTimestampS} from '@threema/ts-utils/number/date-to-unix-timestamp-s';
import {unixTimestampToDateS} from '@threema/ts-utils/number/unix-timestamp-to-date-s';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {TIMER} from '@threema/ts-utils/timer/global-timer';
import {expect} from 'chai';
import {restore, stub} from 'sinon';

import {
    CloseCode,
    ConnectionState,
    CspPayloadType,
    D2mPayloadType,
    MessageDirection,
} from '~/common/enum';
import type {Contact, Conversation, Group} from '~/common/model';
import {
    recoverPendingContactDisappearingTimers,
    recoverPendingGroupDisappearingTimers,
} from '~/common/model/disappearing-timer-reassert';
import type {ServicesForModel} from '~/common/model/types/common';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {CloseInfo} from '~/common/network';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type TaskController,
} from '~/common/network/protocol/task';
import {
    OutgoingContactDisappearingTimerTask,
    OutgoingGroupDisappearingTimerTask,
} from '~/common/network/protocol/task/csp/outgoing-disappearing-timer';
import {randomMessageId} from '~/common/network/protocol/utils';
import {ensureMessageId, type MessageId} from '~/common/network/types';
import {AbortRaiser} from '~/common/utils/signal';
import {assertCspPayloadType, assertD2mPayloadType} from '~/test/mocha/common/assertions';
import {
    addTestGroup,
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    NetworkExpectationFactory,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {decodeMessageEncodable} from '~/test/mocha/common/network/protocol/task/task-test-helpers';

/**
 * Test durable contact/group disappearing-timer intent, generation-safe acknowledgement cleanup,
 * leader gating, and row-driven recovery without current-state scans.
 */
export function run(): void {
    describe('Durable disappearing-timer recovery', function () {
        const me = makeTestUser('MEMEMEME');
        const other1 = makeTestUser('USER0001');
        const other2 = makeTestUser('USER0002');

        let services: TestServices;
        let contact1: ModelStore<Contact>;
        let contact2: ModelStore<Contact>;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            contact1 = addTestUserAsContact(services.model, other1);
            contact2 = addTestUserAsContact(services.model, other2);
        });

        this.afterEach(function () {
            restore();
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        function modelServices(): ServicesForModel {
            return {...services, db: services.model.db} as unknown as ServicesForModel;
        }

        // Set MY timer via the local (picker) path WITHOUT awaiting: the local-state write is
        // synchronous (it runs before the outgoing advertise task, which never resolves while the
        // test task manager is disconnected). Swallow the rejection.
        function setTimerFireAndForget(
            conversation: ModelStore<Conversation>,
            timerSeconds: u53,
        ): void {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromLocal(timerSeconds, new Date())
                .catch(() => {
                    // Ignore (the advertise task does not resolve while disconnected).
                });
        }

        function setContactTimer(
            contact: ModelStore<Contact>,
            timerSeconds: u53,
        ): ModelStore<Conversation> {
            const conversation = contact.get().controller.conversation();
            setTimerFireAndForget(conversation, timerSeconds);
            return conversation;
        }

        it('persists only genuine local contact changes with fresh generations, including OFF', function () {
            const conversation = setContactTimer(contact1, 60);
            const first = services.model.db.getPendingContactDisappearingTimers()[0];
            expect(first?.contactUid).to.equal(contact1.ctx);
            expect(first?.timerSeconds).to.equal(60);

            setTimerFireAndForget(conversation, 0);
            const second = services.model.db.getPendingContactDisappearingTimers()[0];
            expect(second?.timerSeconds).to.equal(0);
            expect(second?.generation).to.be.greaterThan(first?.generation ?? 0);

            setTimerFireAndForget(conversation, 0);
            expect(
                services.model.db.getPendingContactDisappearingTimers()[0]?.generation,
                'same local value does not synthesize fresh intent',
            ).to.equal(second?.generation);
        });

        it('matching contact cleanup cannot clear a newer generation', function () {
            const first = services.model.db.upsertPendingContactDisappearingTimer(
                contact1.ctx,
                60,
                randomMessageId(services.crypto),
                new Date(),
            );
            const second = services.model.db.upsertPendingContactDisappearingTimer(
                contact1.ctx,
                120,
                randomMessageId(services.crypto),
                new Date(),
            );

            expect(
                services.model.db.deletePendingContactDisappearingTimer(
                    contact1.ctx,
                    first.generation,
                ),
            ).to.be.false;
            expect(services.model.db.getPendingContactDisappearingTimers()[0]?.generation).to.equal(
                second.generation,
            );

            expect(
                services.model.db.deletePendingContactDisappearingTimer(
                    contact1.ctx,
                    second.generation,
                ),
            ).to.be.true;
            const third = services.model.db.upsertPendingContactDisappearingTimer(
                contact1.ctx,
                180,
                randomMessageId(services.crypto),
                new Date(),
            );
            expect(third.generation).to.be.greaterThan(second.generation);
            expect(
                services.model.db.deletePendingContactDisappearingTimer(
                    contact1.ctx,
                    second.generation,
                ),
            ).to.be.false;
        });

        it('clears a matching contact generation only after its CSP ACK', async function () {
            setContactTimer(contact1, 90);
            const pending = services.model.db.getPendingContactDisappearingTimers()[0];
            expect(pending).not.to.be.undefined;
            const messageId = Delayed.simple<MessageId>('contact timer message id');
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.write((message) => {
                    assertD2mPayloadType(message.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(message.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    messageId.set(
                        ensureMessageId(decodeMessageEncodable(message.payload.payload).messageId),
                    );
                }),
                NetworkExpectationFactory.readIncomingMessageAck(other1.identity.string, messageId),
            ]);

            await new OutgoingContactDisappearingTimerTask(
                modelServices(),
                contact1.ctx,
                pending?.timerSeconds ?? 0,
                pending?.generation ?? 0,
                pending?.messageId ?? randomMessageId(services.crypto),
                pending?.createdAt ?? new Date(),
            ).run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(0);
        });

        it('keeps contact intent on pre-ACK failure and follower skip', async function () {
            setContactTimer(contact1, 90);
            const pending = services.model.db.getPendingContactDisappearingTimers()[0];
            expect(pending).not.to.be.undefined;
            const failingHandle = new TestHandle(services, [
                NetworkExpectationFactory.write(() => {
                    throw new Error('simulated pre-ACK failure');
                }),
            ]);

            let threw = false;
            try {
                await new OutgoingContactDisappearingTimerTask(
                    modelServices(),
                    contact1.ctx,
                    pending?.timerSeconds ?? 0,
                    pending?.generation ?? 0,
                    pending?.messageId ?? randomMessageId(services.crypto),
                    pending?.createdAt ?? new Date(),
                ).run(failingHandle as unknown as ActiveTaskCodecHandle<'persistent'>);
            } catch {
                threw = true;
            }
            expect(threw).to.be.true;
            expect(services.model.db.getPendingContactDisappearingTimers()[0]?.generation).to.equal(
                pending?.generation,
            );

            const followerHandle = new TestHandle(services, [], {promotedToLeader: false});
            await new OutgoingContactDisappearingTimerTask(
                modelServices(),
                contact1.ctx,
                pending?.timerSeconds ?? 0,
                pending?.generation ?? 0,
                pending?.messageId ?? randomMessageId(services.crypto),
                pending?.createdAt ?? new Date(),
            ).run(followerHandle as unknown as ActiveTaskCodecHandle<'persistent'>);
            followerHandle.finish();
            expect(services.model.db.getPendingContactDisappearingTimers()[0]?.generation).to.equal(
                pending?.generation,
            );
        });

        it('reuses a contact generation wire identity and timestamp after a lost ACK', async function () {
            setContactTimer(contact1, 90);
            const pending = services.model.db.getPendingContactDisappearingTimers()[0];
            expect(pending).not.to.be.undefined;
            if (pending === undefined) {
                return;
            }
            const observed: {readonly id: MessageId; readonly createdAt: Date}[] = [];
            const failedHandle = new TestHandle(services, [
                NetworkExpectationFactory.write((message) => {
                    assertD2mPayloadType(message.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(message.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    const decoded = decodeMessageEncodable(message.payload.payload);
                    observed.push({
                        id: ensureMessageId(decoded.messageId),
                        createdAt: unixTimestampToDateS(decoded.createdAt),
                    });
                    throw new Error('simulated lost ACK');
                }),
            ]);

            try {
                await new OutgoingContactDisappearingTimerTask(
                    modelServices(),
                    contact1.ctx,
                    pending.timerSeconds,
                    pending.generation,
                    pending.messageId,
                    pending.createdAt,
                ).run(failedHandle as unknown as ActiveTaskCodecHandle<'persistent'>);
            } catch {
                // The durable row must survive this uncertain attempt.
            }

            const retriedMessageId = Delayed.simple<MessageId>('retried contact timer message id');
            const retryHandle = new TestHandle(services, [
                NetworkExpectationFactory.write((message) => {
                    assertD2mPayloadType(message.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(message.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    const decoded = decodeMessageEncodable(message.payload.payload);
                    const messageId = ensureMessageId(decoded.messageId);
                    observed.push({
                        id: messageId,
                        createdAt: unixTimestampToDateS(decoded.createdAt),
                    });
                    retriedMessageId.set(messageId);
                }),
                NetworkExpectationFactory.readIncomingMessageAck(
                    other1.identity.string,
                    retriedMessageId,
                ),
            ]);
            await new OutgoingContactDisappearingTimerTask(
                modelServices(),
                contact1.ctx,
                pending.timerSeconds,
                pending.generation,
                pending.messageId,
                pending.createdAt,
            ).run(retryHandle as unknown as ActiveTaskCodecHandle<'persistent'>);
            retryHandle.finish();

            expect(observed.map(({id}) => id)).to.deep.equal([
                pending.messageId,
                pending.messageId,
            ]);
            const wireCreatedAt = unixTimestampToDateS(dateToUnixTimestampS(pending.createdAt));
            expect(observed.map(({createdAt}) => createdAt)).to.deep.equal([
                wireCreatedAt,
                wireCreatedAt,
            ]);
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(0);
        });

        it('keeps contact intent when origination authority is lost during real conditional handoff', async function () {
            const conversation = contact1.get().controller.conversation();
            conversation.get().controller.update.direct({ephemeralTimerSeconds: 90});
            const pending = services.model.db.upsertPendingContactDisappearingTimer(
                contact1.ctx,
                90,
                randomMessageId(services.crypto),
                new Date(),
            );

            const baseController = new TestHandle(services, []).controller;
            const cspAuthenticated = new ResolvablePromise<void>({uncaught: 'default'});
            const controller: TaskController = {
                ...baseController,
                csp: {...baseController.csp, authenticated: cspAuthenticated},
            };
            const connected = services.taskManager.replace(ConnectionState.CONNECTING);
            expect(connected).not.to.be.undefined;
            if (connected === undefined) {
                return;
            }
            const abort = new AbortRaiser<CloseInfo>();
            const protocolLoop = connected.run(services, controller, abort).catch(() => undefined);
            const captureHandle: ActiveTask<ActiveTaskCodecHandle<'persistent'>, 'persistent'> = {
                type: ACTIVE_TASK,
                persist: true,
                transaction: undefined,
                run: async (handle) => await Promise.resolve(handle),
            };
            const handle = await connected.schedule(captureHandle);

            try {
                let finished = false;
                const send = new OutgoingContactDisappearingTimerTask(
                    modelServices(),
                    contact1.ctx,
                    pending.timerSeconds,
                    pending.generation,
                    pending.messageId,
                    pending.createdAt,
                )
                    .run(handle)
                    .finally(() => {
                        finished = true;
                    });

                await TIMER.sleep(1);
                expect(finished, 'task is held at unresolved CSP authentication').to.be.false;
                expect(connected.dispatch.encoder.empty).to.be.true;

                services.volatileProtocolState.setCspOriginator(false);
                expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(1);
                cspAuthenticated.resolve();

                await send;
                expect(connected.dispatch.encoder.empty).to.be.true;
                expect(
                    services.model.db.getPendingContactDisappearingTimers()[0]?.generation,
                ).to.equal(pending.generation);
            } finally {
                abort.raise({code: CloseCode.NORMAL, origin: 'local', reason: 'Test complete'});
                await protocolLoop;
            }
        });

        it('persists only genuine local group timer changes and advances their generation', function () {
            const group: ModelStore<Group> = addTestGroup(services.model, {
                creator: 'me',
                members: [contact1, contact2],
            });
            const conversation = group.get().controller.conversation();

            setTimerFireAndForget(conversation, 60);
            const first = services.model.db.getPendingGroupDisappearingTimers()[0];
            expect(first?.groupUid).to.equal(group.ctx);
            expect(first?.timerSeconds).to.equal(60);

            setTimerFireAndForget(conversation, 120);
            const second = services.model.db.getPendingGroupDisappearingTimers()[0];
            expect(second?.timerSeconds).to.equal(120);
            expect(second?.generation).to.be.greaterThan(first?.generation ?? 0);
        });

        it('matching-generation cleanup cannot clear a newer group timer change', function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const first = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                60,
                new Date(),
            );
            const second = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                120,
                new Date(),
            );

            expect(
                services.model.db.deletePendingGroupDisappearingTimer(group.ctx, first.generation),
            ).to.be.false;
            expect(services.model.db.getPendingGroupDisappearingTimers()[0]?.generation).to.equal(
                second.generation,
            );

            expect(
                services.model.db.deletePendingGroupDisappearingTimer(group.ctx, second.generation),
            ).to.be.true;
            const third = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                180,
                new Date(),
            );
            expect(third.generation).to.be.greaterThan(second.generation);
            expect(
                services.model.db.deletePendingGroupDisappearingTimer(group.ctx, second.generation),
                'an old ACK cannot match a generation created after cleanup',
            ).to.be.false;
        });

        it('clears a matching group timer generation only after its CSP ACK', async function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const pending = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                90,
                new Date(),
            );
            const messageId = Delayed.simple<MessageId>('group timer message id');
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.write((message) => {
                    assertD2mPayloadType(message.type, D2mPayloadType.PROXY);
                    assertCspPayloadType(message.payload.type, CspPayloadType.OUTGOING_MESSAGE);
                    messageId.set(
                        ensureMessageId(decodeMessageEncodable(message.payload.payload).messageId),
                    );
                }),
                NetworkExpectationFactory.readIncomingMessageAck(other1.identity.string, messageId),
            ]);

            await new OutgoingGroupDisappearingTimerTask(
                modelServices(),
                group.ctx,
                pending.timerSeconds,
                pending.generation,
            ).run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
            expect(services.model.db.getPendingGroupDisappearingTimers()).to.have.length(0);
        });

        it('keeps the group timer generation when the CSP write fails before ACK', async function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const pending = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                90,
                new Date(),
            );
            const handle = new TestHandle(services, [
                NetworkExpectationFactory.write(() => {
                    throw new Error('simulated pre-ACK failure');
                }),
            ]);

            let threw = false;
            try {
                await new OutgoingGroupDisappearingTimerTask(
                    modelServices(),
                    group.ctx,
                    pending.timerSeconds,
                    pending.generation,
                ).run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            } catch {
                threw = true;
            }
            expect(threw).to.be.true;
            expect(services.model.db.getPendingGroupDisappearingTimers()[0]?.generation).to.equal(
                pending.generation,
            );
        });

        it('keeps pending group intent when this device is a follower', async function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const pending = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                90,
                new Date(),
            );
            const handle = new TestHandle(services, [], {promotedToLeader: false});

            await new OutgoingGroupDisappearingTimerTask(
                modelServices(),
                group.ctx,
                pending.timerSeconds,
                pending.generation,
            ).run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
            expect(services.model.db.getPendingGroupDisappearingTimers()[0]?.generation).to.equal(
                pending.generation,
            );
        });

        it('keeps pending group intent when no recipient can acknowledge it', async function () {
            const group = addTestGroup(services.model, {creator: 'me', members: []});
            const pending = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                90,
                new Date(),
            );
            const handle = new TestHandle(services, []);

            await new OutgoingGroupDisappearingTimerTask(
                modelServices(),
                group.ctx,
                pending.timerSeconds,
                pending.generation,
            ).run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
            handle.finish();
            expect(services.model.db.getPendingGroupDisappearingTimers()[0]?.generation).to.equal(
                pending.generation,
            );
        });

        it('rejects local timer changes on a follower at the model boundary', async function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const conversation = group.get().controller.conversation();
            services.volatileProtocolState.setCspOriginator(false);

            let threw = false;
            try {
                await conversation.get().controller.updateEphemeralTimer.fromLocal(90, new Date());
            } catch {
                threw = true;
            }
            expect(threw).to.be.true;
            expect(conversation.get().view.ephemeralTimerSeconds).to.be.undefined;
            expect(services.model.db.getPendingGroupDisappearingTimers()).to.have.length(0);
        });

        it('invalidates stale local group intent when an authoritative reflection arrives', function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const conversation = group.get().controller.conversation();
            setTimerFireAndForget(conversation, 90);
            expect(services.model.db.getPendingGroupDisappearingTimers()).to.have.length(1);

            conversation
                .get()
                .controller.updateEphemeralTimer.fromSync(
                    MessageDirection.OUTBOUND,
                    120,
                    me.identity.string,
                    new Date(),
                );

            expect(services.model.db.getPendingGroupDisappearingTimers()).to.have.length(0);
            expect(conversation.get().view.ephemeralTimerSeconds).to.equal(120);
        });

        it('publishes no authoritative group state when persistence fails', function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const conversation = group.get().controller.conversation();
            setTimerFireAndForget(conversation, 90);
            const pending = services.model.db.getPendingGroupDisappearingTimers()[0];
            stub(services.model.db, 'persistAuthoritativeGroupDisappearingTimer').throws(
                new Error('simulated transaction failure'),
            );

            let threw = false;
            try {
                conversation
                    .get()
                    .controller.updateEphemeralTimer.fromSync(
                        MessageDirection.OUTBOUND,
                        120,
                        me.identity.string,
                        new Date(),
                    );
            } catch {
                threw = true;
            }

            expect(threw).to.be.true;
            expect(conversation.get().view.ephemeralTimerSeconds).to.equal(90);
            expect(services.model.db.getPendingGroupDisappearingTimers()[0]?.generation).to.equal(
                pending?.generation,
            );
        });

        it('publishes no local contact state when atomic persistence fails', async function () {
            const conversation = contact1.get().controller.conversation();
            stub(services.model.db, 'persistLocalContactDisappearingTimer').throws(
                new Error('simulated transaction failure'),
            );

            let threw = false;
            try {
                await conversation.get().controller.updateEphemeralTimer.fromLocal(90, new Date());
            } catch {
                threw = true;
            }

            expect(threw).to.be.true;
            expect(conversation.get().view.ephemeralTimerSeconds).to.be.undefined;
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(0);
            expect(conversation.get().controller.getAllStatusMessages().get().size).to.equal(0);
        });

        it('publishes no authoritative contact state when atomic persistence fails', function () {
            const conversation = setContactTimer(contact1, 90);
            const pending = services.model.db.getPendingContactDisappearingTimers()[0];
            stub(services.model.db, 'persistAuthoritativeContactDisappearingTimer').throws(
                new Error('simulated transaction failure'),
            );

            let threw = false;
            try {
                conversation
                    .get()
                    .controller.updateEphemeralTimer.fromRemote(
                        120,
                        other1.identity.string,
                        new Date(),
                    );
            } catch {
                threw = true;
            }

            expect(threw).to.be.true;
            expect(conversation.get().view.ephemeralTimerSeconds).to.equal(90);
            expect(services.model.db.getPendingContactDisappearingTimers()[0]?.generation).to.equal(
                pending?.generation,
            );
        });

        it('deduplicates periodic recovery while a contact generation remains queued', function () {
            setContactTimer(contact1, 90);
            const pending = services.model.db.getPendingContactDisappearingTimers()[0];
            expect(pending).not.to.be.undefined;
            const inFlight = new Set<u53>();
            const log = services.logging.logger('test');

            expect(
                recoverPendingContactDisappearingTimers(modelServices(), log, inFlight),
            ).to.equal(1);
            expect(inFlight.has(pending?.generation ?? 0)).to.be.true;
            expect(
                recoverPendingContactDisappearingTimers(modelServices(), log, inFlight),
            ).to.equal(0);
        });

        it('deduplicates periodic recovery while a group generation remains queued', function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const pending = services.model.db.upsertPendingGroupDisappearingTimer(
                group.ctx,
                90,
                new Date(),
            );
            const inFlight = new Set<u53>();
            const log = services.logging.logger('test');

            expect(recoverPendingGroupDisappearingTimers(modelServices(), log, inFlight)).to.equal(
                1,
            );
            expect(inFlight.has(pending.generation)).to.be.true;
            expect(recoverPendingGroupDisappearingTimers(modelServices(), log, inFlight)).to.equal(
                0,
            );
        });

        it('recovers durable group intent on every leader transition without scanning existing timers', function () {
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            const conversation = group.get().controller.conversation();
            setTimerFireAndForget(conversation, 300);
            const pending = services.model.db.getPendingGroupDisappearingTimers()[0];
            expect(pending).not.to.be.undefined;

            const log = services.logging.logger('test');
            expect(recoverPendingGroupDisappearingTimers(modelServices(), log)).to.equal(1);
            expect(recoverPendingGroupDisappearingTimers(modelServices(), log)).to.equal(1);

            // Once matching intent is cleared, the still-existing group timer is not reconstructed.
            services.model.db.deletePendingGroupDisappearingTimer(
                group.ctx,
                pending?.generation ?? 0,
            );
            expect(conversation.get().view.ephemeralTimerSeconds).to.equal(300);
            expect(recoverPendingGroupDisappearingTimers(modelServices(), log)).to.equal(0);
        });

        it('recovers only durable contact rows and never scans shared contact values', function () {
            const conversation1 = setContactTimer(contact1, 3600);
            const conversation2 = setContactTimer(contact2, 0);
            const other3 = makeTestUser('USER0003');
            const contact3 = addTestUserAsContact(services.model, other3);
            contact3
                .get()
                .controller.conversation()
                .get()
                .controller.updateEphemeralTimer.fromRemote(
                    120,
                    other3.identity.string,
                    new Date(),
                );
            const group = addTestGroup(services.model, {creator: 'me', members: [contact1]});
            setTimerFireAndForget(group.get().controller.conversation(), 3600);

            const log = services.logging.logger('test');
            expect(recoverPendingContactDisappearingTimers(modelServices(), log)).to.equal(2);

            for (const pending of services.model.db.getPendingContactDisappearingTimers()) {
                services.model.db.deletePendingContactDisappearingTimer(
                    pending.contactUid,
                    pending.generation,
                );
            }
            expect(conversation1.get().view.ephemeralTimerSeconds).to.equal(3600);
            expect(conversation2.get().view.ephemeralTimerSeconds).to.equal(0);
            expect(
                contact3.get().controller.conversation().get().view.ephemeralTimerSeconds,
            ).to.equal(120);
            expect(recoverPendingContactDisappearingTimers(modelServices(), log)).to.equal(0);
        });
    });
}
