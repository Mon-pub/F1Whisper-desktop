import {expect} from 'chai';

import type {DatabaseBackend} from '~/common/db';
import {OutgoingMessageOutboxRecoveryService} from '~/common/dom/backend/outgoing-message-outbox-recovery-service';
import {CspPayloadType, D2mPayloadType, GroupUserState, MessageDirection} from '~/common/enum';
import type {Contact, Conversation, Group} from '~/common/model';
import {
    clearOutgoingMessageFromOutbox,
    enrollOutgoingMessageInOutbox,
    recoverOutgoingMessageOutbox,
} from '~/common/model/outgoing-message-outbox';
import type {ServicesForModel} from '~/common/model/types/common';
import type {AnyOutboundNonDeletedMessageModelStore} from '~/common/model/types/message';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {ActiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingConversationMessageTask} from '~/common/network/protocol/task/csp/outgoing-conversation-message';
import {randomMessageId} from '~/common/network/protocol/utils';
import type {MessageId} from '~/common/network/types';
import {assert} from '~/common/utils/assert';
import {Delayed} from '~/common/utils/delayed';
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
import {createAudioMessage, createFileMessage} from '~/test/mocha/common/db-backend-tests';
import {
    decodeMessageEncodable,
    decryptMetadata,
} from '~/test/mocha/common/network/protocol/task/task-test-helpers';

/**
 * Test the F1Whisper fork durable outgoing-message outbox (P-H12): the DB persistence + enroll/clear
 * helpers, the enroll-before-send behavior of `addMessage.fromLocal`, and `recoverOutgoingMessageOutbox`
 * (the startup recovery that reconstructs send tasks for messages that were persisted but not yet
 * transmitted -- exactly the state after a crash/quit/profile switch).
 *
 * The test task manager is disconnected, so an outgoing message's persistent send task queues but
 * never resolves; that is faithful to the scenario the outbox guards (an unfinished send at quit).
 */
export function run(): void {
    describe('Durable outgoing-message outbox (F1Whisper fork P-H12)', function () {
        const me = makeTestUser('MEMEMEME');
        const anotherUser = makeTestUser('USER0001');

        let services: TestServices;
        let contact: ModelStore<Contact>;
        let conversation: ModelStore<Conversation>;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            contact = addTestUserAsContact(services.model, anotherUser);
            conversation = contact.get().controller.conversation();
        });

        this.afterEach(function () {
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        // A `ServicesForModel` synthesized from the test services: recovery + task reconstruction
        // need the model-layer service set with a top-level `db` (which `TestServices` nests under
        // `.model.db`).
        function recoveryServices(): ServicesForModel {
            return {...services, db: services.model.db} as unknown as ServicesForModel;
        }

        function db(): DatabaseBackend {
            return services.model.db;
        }

        // Create a real outbound text message via the production send path (which also enrolls it in
        // the durable outbox), returning its id and model store.
        async function sendOutboundText(
            text: string,
        ): Promise<{id: MessageId; store: AnyOutboundNonDeletedMessageModelStore}> {
            const id = randomMessageId(services.crypto);
            const store = await conversation.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id,
                createdAt: new Date(),
                text,
            });
            return {id, store: store as AnyOutboundNonDeletedMessageModelStore};
        }

        // Create a real outbound MEDIA message directly in the DB. Files/media are sent through a
        // heavier blob flow than fromLocal text, so (like the rest of the suite) media rows are
        // created directly; outbound = no senderContactUid. Returns the message id.
        function addOutboundFileMessage(fileName: string): MessageId {
            const id = randomMessageId(services.crypto);
            createFileMessage(services.model.db, {
                id,
                conversationUid: conversation.ctx,
                mediaType: 'application/pdf',
                fileName,
                fileSize: 1234,
            });
            return id;
        }

        function addOutboundAudioMessage(): MessageId {
            const id = randomMessageId(services.crypto);
            createAudioMessage(services.model.db, {
                id,
                conversationUid: conversation.ctx,
                mediaType: 'audio/aac',
                fileSize: 4321,
            });
            return id;
        }

        // Stamp an outbound message's sentAt (simulate the CSP ack that clears the outbox row).
        function markSent(id: MessageId): void {
            const store = conversation.get().controller.getMessage(id);
            assert(store !== undefined && store.ctx === MessageDirection.OUTBOUND);
            // The freshly-created media message is a live outbound (non-deleted) message.
            (store as AnyOutboundNonDeletedMessageModelStore).get().controller.sent(new Date());
        }

        describe('DB persistence + enroll/clear helpers', function () {
            it('enrolls and lists a durable outbox entry', function () {
                const messageId = randomMessageId(services.crypto);
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId,
                    conversationUid: conversation.ctx,
                });

                const entries = db().getAllOutgoingMessageOutboxEntries();
                expect(entries).to.have.length(1);
                const entry = entries[0];
                assert(entry !== undefined);
                expect(entry.messageId).to.equal(messageId);
                expect(entry.conversationUid).to.equal(conversation.ctx);
            });

            it('enroll is idempotent (no duplicate rows for the same message id)', function () {
                const messageId = randomMessageId(services.crypto);
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId,
                    conversationUid: conversation.ctx,
                });
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId,
                    conversationUid: conversation.ctx,
                });

                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(1);
            });

            it('clear removes the entry', function () {
                const messageId = randomMessageId(services.crypto);
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId,
                    conversationUid: conversation.ctx,
                });
                clearOutgoingMessageFromOutbox(recoveryServices(), messageId);

                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);
            });

            it('clear is a no-op for an unknown message id', function () {
                const messageId = randomMessageId(services.crypto);
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId,
                    conversationUid: conversation.ctx,
                });
                // Clearing a different (never-enrolled) id must not throw and must not touch the row.
                clearOutgoingMessageFromOutbox(
                    recoveryServices(),
                    randomMessageId(services.crypto),
                );

                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(1);
            });
        });

        describe('enroll-before-send (addMessage.fromLocal)', function () {
            it('enrolls exactly one durable entry per outgoing message', async function () {
                const {id} = await sendOutboundText('durable-outbox-enroll-1');

                const entries = db().getAllOutgoingMessageOutboxEntries();
                expect(entries).to.have.length(1);
                expect(entries[0]?.messageId).to.equal(id);
            });

            it('enrolls one distinct entry per message for several messages', async function () {
                const {id: id1} = await sendOutboundText('durable-outbox-enroll-a');
                const {id: id2} = await sendOutboundText('durable-outbox-enroll-b');

                const ids = db()
                    .getAllOutgoingMessageOutboxEntries()
                    .map((entry) => entry.messageId);
                expect(ids).to.have.length(2);
                expect(ids).to.include(id1);
                expect(ids).to.include(id2);
            });

            it('advertises the compose-time timer after the shared timer changes before handoff', async function () {
                conversation
                    .get()
                    .controller.updateEphemeralTimer.fromRemote(
                        25,
                        anotherUser.identity.string,
                        new Date(),
                    );
                const sending = sendOutboundText('compose-time-timer-freeze');
                conversation
                    .get()
                    .controller.updateEphemeralTimer.fromRemote(
                        90,
                        anotherUser.identity.string,
                        new Date(),
                    );
                const {id, store} = await sending;
                expect(store.get().view.disappearingTimerSeconds).to.equal(25);

                const task = new OutgoingConversationMessageTask(
                    recoveryServices(),
                    conversation.ctx,
                    id,
                );
                const handle = new TestHandle(services, [
                    NetworkExpectationFactory.reflect((payloads) => {
                        expect(payloads).to.have.length(2);
                    }),
                    NetworkExpectationFactory.write((outbound) => {
                        assertD2mPayloadType(outbound.type, D2mPayloadType.PROXY);
                        assertCspPayloadType(
                            outbound.payload.type,
                            CspPayloadType.OUTGOING_MESSAGE,
                        );
                        const message = decodeMessageEncodable(outbound.payload.payload);
                        const metadata = decryptMetadata(
                            services,
                            message,
                            services.device.csp.ck.public,
                            anotherUser.ck,
                        );
                        expect(metadata?.f1DisappearingTimer).to.equal(25);
                    }),
                    NetworkExpectationFactory.readIncomingMessageAck(
                        anotherUser.identity.string,
                        Delayed.simple('message id', id),
                    ),
                    NetworkExpectationFactory.write(),
                    NetworkExpectationFactory.readIncomingMessageAckWithoutMessageId(
                        services,
                        anotherUser.identity.string,
                    ),
                    NetworkExpectationFactory.reflectSingle(),
                ]);

                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();
            });

            it('message deletion immediately invalidates outbox and queued work self-dismisses', async function () {
                const {id} = await sendOutboundText('delete-before-handoff');
                const task = new OutgoingConversationMessageTask(
                    recoveryServices(),
                    conversation.ctx,
                    id,
                );

                conversation.get().controller.removeMessage.direct(id);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);

                const handle = new TestHandle(services, []);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();
            });

            it('conversation soft-delete invalidates all outbox rows and queued work self-dismisses', async function () {
                const {id} = await sendOutboundText('conversation-delete-before-handoff');
                const task = new OutgoingConversationMessageTask(
                    recoveryServices(),
                    conversation.ctx,
                    id,
                );

                conversation.get().controller.update.direct({lastUpdate: undefined});
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);

                const handle = new TestHandle(services, []);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();
            });

            it('lost group membership is terminally surfaced and clears durable send intent', async function () {
                const group: ModelStore<Group> = addTestGroup(services.model, {
                    creator: 'me',
                    members: [contact],
                    userState: GroupUserState.MEMBER,
                });
                const groupConversation = group.get().controller.conversation();
                const id = randomMessageId(services.crypto);
                const message = await groupConversation.get().controller.addMessage.fromLocal({
                    direction: MessageDirection.OUTBOUND,
                    type: 'text',
                    id,
                    createdAt: new Date(),
                    text: 'membership-lost-before-handoff',
                });
                const task = new OutgoingConversationMessageTask(
                    recoveryServices(),
                    groupConversation.ctx,
                    id,
                );

                group
                    .get()
                    .controller.lifetimeGuard.update(() => ({userState: GroupUserState.LEFT}));
                const handle = new TestHandle(services, []);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(
                    (message as AnyOutboundNonDeletedMessageModelStore).get().view.sendFailedAt,
                ).to.be.instanceOf(Date);
                expect(
                    db().getMessageByUid(message.get().controller.uid)?.sendFailedAt,
                ).to.be.instanceOf(Date);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);
            });
        });

        describe('startup recovery', function () {
            it('reconstructs a send task for a pending (unsent) message and keeps its row', async function () {
                const {id} = await sendOutboundText('durable-outbox-recover-pending');
                // Precondition: enrolled, message unsent (the disconnected task never resolved).
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(1);

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(1);
                expect(result.dropped).to.equal(0);
                // A pending message keeps its durable row until its (reconstructed) send confirms.
                const entries = db().getAllOutgoingMessageOutboxEntries();
                expect(entries).to.have.length(1);
                expect(entries[0]?.messageId).to.equal(id);
            });

            it('drops an already-transmitted message without re-sending (transmit exactly once)', async function () {
                const {store} = await sendOutboundText('durable-outbox-recover-sent');
                // Simulate the CSP ack having stamped sentAt before the last quit.
                store.get().controller.sent(new Date());

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(0);
                expect(result.dropped).to.equal(1);
                // The stale row is cleaned up; the message is NOT reconstructed/re-sent.
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);
            });

            it('drops an entry whose message no longer exists', function () {
                // A durable row for a message that was deleted while its send was pending.
                const orphanId = randomMessageId(services.crypto);
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId: orphanId,
                    conversationUid: conversation.ctx,
                });

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(0);
                expect(result.dropped).to.equal(1);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);
            });

            it('reconstructs exactly one task per pending message across several messages', async function () {
                await sendOutboundText('durable-outbox-recover-multi-a');
                await sendOutboundText('durable-outbox-recover-multi-b');
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(2);

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(2);
                expect(result.dropped).to.equal(0);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(2);
            });

            it('recovers nothing when the outbox is empty', function () {
                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );
                expect(result.recovered).to.equal(0);
                expect(result.dropped).to.equal(0);
            });

            it('a second recovery pass via the service is a no-op (idempotency guard)', async function () {
                await sendOutboundText('durable-outbox-idempotent-recovery');
                const service = new OutgoingMessageOutboxRecoveryService(recoveryServices());

                const first = service.recover();
                expect(first.recovered).to.equal(1);

                // The pending entry is still enrolled (its reconstructed send never resolved). A
                // second pass must NOT reconstruct it again -- the service's _recovered guard
                // protects against the two backend creation paths both invoking recovery. (Remove
                // the guard and this second.recovered becomes 1.)
                const second = service.recover();
                expect(second.recovered).to.equal(0);
                expect(second.dropped).to.equal(0);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(1);
            });
        });

        describe('in-flight media', function () {
            it('enrolls and clears a durable entry for a media (file) message', function () {
                const fileId = addOutboundFileMessage('durable-outbox-media.pdf');
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId: fileId,
                    conversationUid: conversation.ctx,
                });
                expect(
                    db()
                        .getAllOutgoingMessageOutboxEntries()
                        .map((entry) => entry.messageId),
                ).to.deep.equal([fileId]);

                clearOutgoingMessageFromOutbox(recoveryServices(), fileId);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);
            });

            it('reconstructs a send task for a pending media (file) message', function () {
                const fileId = addOutboundFileMessage('durable-outbox-media-pending.pdf');
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId: fileId,
                    conversationUid: conversation.ctx,
                });

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(1);
                expect(result.dropped).to.equal(0);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(1);
            });

            it('drops an already-transmitted media (file) message without re-sending', function () {
                const fileId = addOutboundFileMessage('durable-outbox-media-sent.pdf');
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId: fileId,
                    conversationUid: conversation.ctx,
                });
                markSent(fileId);

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(0);
                expect(result.dropped).to.equal(1);
                expect(db().getAllOutgoingMessageOutboxEntries()).to.have.length(0);
            });

            it('reconstructs a send task for a pending voice (audio) message', function () {
                const audioId = addOutboundAudioMessage();
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId: audioId,
                    conversationUid: conversation.ctx,
                });

                const result = recoverOutgoingMessageOutbox(
                    recoveryServices(),
                    services.logging.logger('test'),
                );

                expect(result.recovered).to.equal(1);
                expect(result.dropped).to.equal(0);
            });
        });
    });
}
