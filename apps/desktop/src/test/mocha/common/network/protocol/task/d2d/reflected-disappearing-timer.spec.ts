import {dateToUnixTimestampMs} from '@threema/ts-utils/number/date-to-unix-timestamp-ms';
import {intoUnsignedLong} from '@threema/ts-utils/number/into-unsigned-long';
import {expect} from 'chai';

import {NACL_CONSTANTS} from '~/common/crypto';
import {
    CspE2eContactControlType,
    CspE2eGroupControlType,
    type D2dCspMessageType,
    D2dProtocolVersion,
} from '~/common/enum';
import type {Contact, Conversation, ConversationView} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {d2d} from '~/common/network/protobuf';
import {ReflectedIncomingMessageTask} from '~/common/network/protocol/task/d2d/reflected-incoming-message';
import {ReflectedOutgoingMessageTask} from '~/common/network/protocol/task/d2d/reflected-outgoing-message';
import {randomGroupId, randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import {encodeDisappearingTimer} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import {
    ensureD2mDeviceId,
    ensureIdentityString,
    type GroupId,
    type Nickname,
} from '~/common/network/types';
import {Identity} from '~/common/utils/identity';
import {
    addTestGroup,
    addTestUserAsContact,
    createClientKey,
    makeTestServices,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {secondsAgo} from '~/test/mocha/common/utils';

/**
 * F1Whisper fork (FU-H04b): a linked follower desktop applies a disappearing-messages timer control
 * that the phone leader reflected to the device group, phone-authoritatively (never re-sending).
 * Both contact directions authoritatively replace the single shared field without re-sending.
 * Groups retain their existing single shared last-writer-wins field.
 */
export function run(): void {
    describe('Reflected disappearing-timer (FU-H04b follower accept)', function () {
        const me = ensureIdentityString('MEMEMEME');
        const user1 = {
            identity: new Identity(ensureIdentityString('USER0001')),
            nickname: 'user1' as Nickname,
            ck: createClientKey(),
        };

        let services: TestServices;
        let user: ModelStore<Contact>;
        let userConversation: ModelStore<Conversation>;
        let groupId: GroupId;
        let groupConversation: ModelStore<Conversation>;

        this.beforeEach(function () {
            services = makeTestServices(me);
            user = addTestUserAsContact(services.model, user1);
            userConversation = user.get().controller.conversation();
            groupId = randomGroupId(services.crypto);
            const group = addTestGroup(services.model, {
                groupId,
                creator: user,
                name: 'A group',
                members: [user],
            });
            groupConversation = group.get().controller.conversation();
        });
        this.afterEach(function () {
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        function encode1to1Timer(seconds: number): Uint8Array {
            const encoder = encodeDisappearingTimer(seconds);
            return encoder.encode(new Uint8Array(encoder.byteLength()));
        }

        function encodeGroupTimer(seconds: number, encodedGroupId = groupId): Uint8Array {
            const encoder = structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                creatorIdentity: user1.identity.bytes,
                groupId: encodedGroupId,
                innerData: encodeDisappearingTimer(seconds),
            });
            return encoder.encode(new Uint8Array(encoder.byteLength()));
        }

        // Run a reflected INCOMING timer control (the peer set it). `TestHandle(services, [])` asserts
        // NOTHING is sent (the echo-loop guard: a follower must never re-send a reflected timer).
        async function runIncoming(
            type:
                | CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER
                | CspE2eGroupControlType.GROUP_DISAPPEARING_TIMER,
            body: Uint8Array,
        ): Promise<void> {
            const reflectedMessage: d2d.IncomingMessage = {
                senderIdentity: user1.identity.string,
                messageId: intoUnsignedLong(randomMessageId(services.crypto)),
                createdAt: intoUnsignedLong(dateToUnixTimestampMs(secondsAgo(10))),
                // The raw wire type 0x85/0x95 (133/149) is NOT in the generated `CspE2eMessageType`
                // proto enum; the runtime validator (`ensureCspE2eType`) accepts it, so a wire message
                // literally carries the raw number here.
                type: type as unknown as D2dCspMessageType,
                body,
                nonce: services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH)),
            };
            const task = new ReflectedIncomingMessageTask(
                services,
                reflectedMessage,
                ensureD2mDeviceId(42n),
                secondsAgo(5),
                D2dProtocolVersion.UNSPECIFIED,
            );
            const handle = new TestHandle(services, []);
            await task.run(handle);
            handle.finish();
        }

        // Run a reflected OUTGOING 1:1 timer control (the phone set MY timer).
        async function runOutgoing1to1(seconds: number): Promise<void> {
            const reflectedMessage: d2d.OutgoingMessage = {
                conversation: {
                    id: 'contact',
                    contact: user1.identity.string,
                    group: undefined,
                    distributionList: undefined,
                },
                messageId: intoUnsignedLong(randomMessageId(services.crypto)),
                threadMessageId: undefined,
                createdAt: intoUnsignedLong(dateToUnixTimestampMs(secondsAgo(10))),
                // Raw wire type 0x85 (133), not in the generated proto enum (see runIncoming).
                type: CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER as unknown as D2dCspMessageType,
                body: encode1to1Timer(seconds),
                nonces: [services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH))],
            };
            const task = new ReflectedOutgoingMessageTask(
                services,
                reflectedMessage,
                ensureD2mDeviceId(42n),
                secondsAgo(5),
                D2dProtocolVersion.UNSPECIFIED,
            );
            const handle = new TestHandle(services, []);
            await task.run(handle);
            handle.finish();
        }

        async function runOutgoingGroup(
            seconds: number,
            bodyGroupId = groupId,
            envelopeGroupId = groupId,
        ): Promise<void> {
            const reflectedMessage: d2d.OutgoingMessage = {
                conversation: {
                    id: 'group',
                    contact: undefined,
                    group: {
                        creatorIdentity: user1.identity.string,
                        groupId: intoUnsignedLong(envelopeGroupId),
                    },
                    distributionList: undefined,
                },
                messageId: intoUnsignedLong(randomMessageId(services.crypto)),
                threadMessageId: undefined,
                createdAt: intoUnsignedLong(dateToUnixTimestampMs(secondsAgo(10))),
                type: CspE2eGroupControlType.GROUP_DISAPPEARING_TIMER as unknown as D2dCspMessageType,
                body: encodeGroupTimer(seconds, bodyGroupId),
                nonces: [services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.NONCE_LENGTH))],
            };
            const task = new ReflectedOutgoingMessageTask(
                services,
                reflectedMessage,
                ensureD2mDeviceId(42n),
                secondsAgo(5),
                D2dProtocolVersion.UNSPECIFIED,
            );
            const handle = new TestHandle(services, []);
            await task.run(handle);
            handle.finish();
        }

        function view(): Readonly<ConversationView> {
            return userConversation.get().controller.lifetimeGuard.run((handle) => handle.view());
        }
        function groupView(): Readonly<ConversationView> {
            return groupConversation.get().controller.lifetimeGuard.run((handle) => handle.view());
        }

        it('1:1 INBOUND reflected timer applies the shared field', async function () {
            await runIncoming(
                CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER,
                encode1to1Timer(3600),
            );
            expect(view().ephemeralTimerSeconds).to.equal(3600);
        });

        it('1:1 INBOUND explicit OFF clears the shared field', async function () {
            await runIncoming(
                CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER,
                encode1to1Timer(0),
            );
            expect(view().ephemeralTimerSeconds).to.be.undefined;
        });

        it('1:1 INBOUND change converges to the latest value', async function () {
            await runIncoming(
                CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER,
                encode1to1Timer(60),
            );
            expect(view().ephemeralTimerSeconds).to.equal(60);
            await runIncoming(
                CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER,
                encode1to1Timer(120),
            );
            expect(view().ephemeralTimerSeconds, 'latest value wins').to.equal(120);
        });

        it('1:1 OUTBOUND reflected timer applies the shared field', async function () {
            userConversation
                .get()
                .controller.updateEphemeralTimer.fromLocal(1800, new Date())
                .catch(() => {
                    // The disconnected test task manager cannot deliver the local control.
                });
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(1);

            await runOutgoing1to1(1800);
            expect(view().ephemeralTimerSeconds, 'MY timer applied').to.equal(1800);
            expect(
                services.model.db.getPendingContactDisappearingTimers(),
                'same-value authoritative reflection invalidates local intent',
            ).to.have.length(0);
        });

        it('1:1 OUTBOUND explicit OFF stores MY OFF as 0 (distinct from never-configured)', async function () {
            await runOutgoing1to1(600);
            expect(view().ephemeralTimerSeconds).to.equal(600);
            await runOutgoing1to1(0);
            expect(view().ephemeralTimerSeconds, 'explicit MY OFF').to.equal(0);
        });

        it('group reflected timer writes the shared field (last-writer-wins)', async function () {
            await runIncoming(
                CspE2eGroupControlType.GROUP_DISAPPEARING_TIMER,
                encodeGroupTimer(7200),
            );
            expect(groupView().ephemeralTimerSeconds, 'group shared timer').to.equal(7200);
            // The contact conversation must be unaffected.
            expect(view().ephemeralTimerSeconds).to.equal(undefined);
        });

        it('group reflected OFF clears the shared field to undefined', async function () {
            await runIncoming(
                CspE2eGroupControlType.GROUP_DISAPPEARING_TIMER,
                encodeGroupTimer(300),
            );
            expect(groupView().ephemeralTimerSeconds).to.equal(300);
            await runIncoming(CspE2eGroupControlType.GROUP_DISAPPEARING_TIMER, encodeGroupTimer(0));
            expect(groupView().ephemeralTimerSeconds, 'group OFF stored as undefined').to.equal(
                undefined,
            );
        });

        it('applies a reflected outgoing group timer when body and envelope identities match', async function () {
            await runOutgoingGroup(900);
            expect(groupView().ephemeralTimerSeconds).to.equal(900);
        });

        it('discards a reflected outgoing group timer whose body and envelope identities differ', async function () {
            await runOutgoingGroup(900, randomGroupId(services.crypto), groupId);
            expect(groupView().ephemeralTimerSeconds).to.be.undefined;
        });
    });
}
