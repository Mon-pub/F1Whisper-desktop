import {expect} from 'chai';
import {restore, spy, useFakeTimers} from 'sinon';

import type {DbContactUid} from '~/common/db';
import {MessageDirection, StatusMessageType} from '~/common/enum';
import {randomFileEncryptionKey, randomFileId} from '~/common/file-storage';
import type {Contact, Conversation, Group} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import {randomMessageId} from '~/common/network/protocol/utils';
import {ensureIdentityString} from '~/common/network/types';
import {FILE_STORAGE_FORMAT} from '~/common/node/file-storage/system-file-storage';
import {assert} from '~/common/utils/assert';
import {
    addTestGroup,
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {randomBlobKey} from '~/test/mocha/common/db-backend-tests';

/**
 * F1Whisper fork: per-direction disappearing-timer split (Android DB v123 parity).
 *
 * Validates the MY/PEER separation that fixes the offline-flip bug:
 *
 * - MY (`ephemeralTimerSeconds`)     = my picker; governs OUTGOING stamping + what I advertise.
 * - PEER (`peerEphemeralTimerSeconds`) = incoming 0x85/0x95; governs INCOMING freezing.
 */
export function run(): void {
    describe('Conversation model: per-direction disappearing timer', function () {
        const me = makeTestUser('MEMEMEME');
        const peer = makeTestUser('PEER0001');
        const peerIdentity = ensureIdentityString('PEER0001');

        let services: TestServices;
        let contact: ModelStore<Contact>;
        let conversation: ModelStore<Conversation>;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            contact = addTestUserAsContact(services.model, peer);
            conversation = contact.get().controller.conversation();
        });

        this.afterEach(function () {
            restore();
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        function view(): {
            readonly my: number | undefined;
            readonly peer: number | undefined;
        } {
            const v = conversation.get().view;
            return {my: v.ephemeralTimerSeconds, peer: v.peerEphemeralTimerSeconds};
        }

        // Set MY timer via the local (picker) path without awaiting. The local-state write is
        // synchronous; the awaited part is only the outgoing advertise task, which would never
        // resolve while the test task manager is disconnected. We swallow the promise rejection.
        function setMyTimerFireAndForget(timerSeconds: number): void {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromLocal(timerSeconds, new Date())
                .catch(() => {
                    // Ignore (the outgoing advertise task does not resolve while disconnected).
                });
        }

        function disappearingStatusCount(): number {
            return [...conversation.get().controller.getAllStatusMessages().get()].filter(
                (s) => s.type === StatusMessageType.DISAPPEARING_TIMER_CHANGED,
            ).length;
        }

        function addInboundText(id = randomMessageId(services.crypto)): ModelStore<Conversation> {
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.INBOUND,
                type: 'text',
                id,
                text: 'hi',
                sender: conversation.get().controller.receiver().ctx as DbContactUid,
                createdAt: new Date(),
                receivedAt: new Date(),
                raw: new Uint8Array(0),
            });
            return conversation;
        }

        function lastInboundMessageView(id: ReturnType<typeof randomMessageId>): {
            readonly frozen: number | undefined;
            readonly expiresAt: Date | undefined;
        } {
            const store = conversation.get().controller.getMessage(id);
            assert(store !== undefined && store.type !== 'deleted');
            const v = store.get().view;
            return {frozen: v.disappearingTimerSeconds, expiresAt: v.expiresAt};
        }

        // --- INCOMING writes PEER, not MY (when MY already set) -------------------------------

        it('incoming advertisement writes PEER, and adopts MY only when MY is unset', function () {
            // MY unset initially.
            expect(view()).to.deep.equal({my: undefined, peer: undefined});

            // First incoming (30s): writes PEER=30 AND adopts MY=30 (MY was unset).
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: 30, peer: 30});
        });

        it('incoming NEVER overwrites a MY the user explicitly set (incl. OFF)', function () {
            // User explicitly sets MY = 60 (fire-and-forget: the local write is synchronous; we do
            // not await the outgoing advertise task, which would hang while disconnected).
            setMyTimerFireAndForget(60);
            expect(view().my).to.equal(60);

            // Incoming advertises 30: writes PEER=30 but leaves MY=60 (explicit choice sticks).
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: 60, peer: 30});

            // User explicitly turns MY OFF -> MY=undefined (NOT 0). PEER untouched.
            setMyTimerFireAndForget(0);
            expect(view()).to.deep.equal({my: undefined, peer: 30});

            // A subsequent incoming OFF advertisement writes PEER=0 and, because MY is now unset,
            // adopts MY = undefined (preserve OFF as undefined, never 0).
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: undefined, peer: 0});
        });

        // --- THE offline-flip test: my-OFF does NOT un-expire peer messages -------------------

        it('turning MY off does NOT un-freeze the peer-frozen incoming messages', function () {
            // Peer advertises 30s -> PEER=30, MY adopts 30.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());

            // An incoming message is frozen at receive from PEER (30s).
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(
                lastInboundMessageView(incomingId).frozen,
                'frozen from PEER at receive',
            ).to.equal(30);

            // The user turns MY off (MY=undefined). PEER stays 30.
            setMyTimerFireAndForget(0);
            expect(view()).to.deep.equal({my: undefined, peer: 30});

            // A NEW incoming message must STILL freeze from PEER (30) — my-OFF must not leak to
            // incoming.
            const incoming2Id = randomMessageId(services.crypto);
            addInboundText(incoming2Id);
            expect(
                lastInboundMessageView(incoming2Id).frozen,
                'new incoming still frozen from PEER after my-OFF',
            ).to.equal(30);

            // The already-frozen first message keeps its frozen timer (30), independent of MY.
            expect(lastInboundMessageView(incomingId).frozen).to.equal(30);
        });

        // --- INCOMING freeze reads PEER null -> OFF (no MY fallback) --------------------------

        it('incoming freeze reads PEER; PEER unset -> OFF even when MY is set (no MY fallback)', function () {
            // User sets MY=45 but the PEER never advertised anything.
            setMyTimerFireAndForget(45);
            expect(view()).to.deep.equal({my: 45, peer: undefined});

            // An incoming message must NOT freeze (PEER unset = OFF for incoming; no fallback to MY).
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(
                lastInboundMessageView(incomingId).frozen,
                'incoming not frozen when PEER unset (no MY fallback)',
            ).to.be.undefined;
        });

        it('incoming freeze applies when PEER is set', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(20, peerIdentity, new Date());
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(20);
        });

        // --- RE-ASSERT status-row dedup ------------------------------------------------------

        it('a re-broadcast of the same PEER value does NOT add a duplicate status row', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(disappearingStatusCount(), 'first advertisement adds a status row').to.equal(1);

            // Same value re-broadcast (reassert): no new status row, PEER unchanged.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(disappearingStatusCount(), 'reassert is de-duped').to.equal(1);
            expect(view().peer).to.equal(30);

            // A real change (60) does add a row.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(60, peerIdentity, new Date());
            expect(disappearingStatusCount(), 'real change adds a row').to.equal(2);
        });

        it('an OFF re-broadcast when already OFF/unset does NOT add a status row', function () {
            // PEER never advertised; an OFF advertisement when previousPeer is undefined is a
            // reassert (no row).
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            expect(disappearingStatusCount()).to.equal(0);
            expect(view().peer).to.equal(0);

            // Another OFF (previousPeer = 0): still a reassert, no row.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            expect(disappearingStatusCount()).to.equal(0);
        });

        // --- RE-ASSERT piggyback throttle on outgoing content --------------------------------

        /**
         * Spy on `taskManager.schedule` and count scheduled disappearing-timer (re-assert) tasks.
         * Returns a getter for the count of DisappearingTimer tasks scheduled so far.
         */
        function spyDisappearingTimerSchedules(): () => number {
            const scheduleSpy = spy(services.taskManager, 'schedule');
            return () =>
                scheduleSpy
                    .getCalls()
                    .filter((call) =>
                        (
                            call.args[0] as {readonly constructor: {readonly name: string}}
                        ).constructor.name.includes('DisappearingTimer'),
                    ).length;
        }

        async function sendOutboundText(): Promise<void> {
            await conversation.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id: randomMessageId(services.crypto),
                text: 'out',
                createdAt: new Date(),
            });
        }

        it('piggybacks MY timer on the first outgoing content send, then throttles for 5 min', async function () {
            // MY = 30 (user set; fire-and-forget local write) — done BEFORE the spy so its own
            // advertise task is not counted.
            setMyTimerFireAndForget(30);

            const clock = useFakeTimers({now: 1_000_000, toFake: ['Date']});
            const scheduledCount = spyDisappearingTimerSchedules();

            // First outgoing content send -> piggyback fires (unseen this run).
            await sendOutboundText();
            expect(scheduledCount(), 'first send piggybacks a re-assert').to.equal(1);

            // Immediate second send -> throttled (<5 min).
            await sendOutboundText();
            expect(scheduledCount(), 'second send within 5 min is throttled').to.equal(1);

            // Advance the clock past the 5-min interval -> next send re-asserts again.
            clock.tick(5 * 60 * 1000 + 1);
            await sendOutboundText();
            expect(scheduledCount(), 'send after 5 min re-asserts again').to.equal(2);
        });

        it('does NOT piggyback when MY timer is off', async function () {
            // MY never set (off). PEER may be set (from an incoming) — must not trigger a piggyback.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            const scheduledCount = spyDisappearingTimerSchedules();
            await sendOutboundText();
            expect(scheduledCount(), 'no piggyback when MY is off').to.equal(0);
        });

        // --- HARD-PURGE on disappear (no tombstone, matching Android) -------------------------

        it('disappearing a message HARD-PURGES the row (no tombstone), frees the blob, sends nothing', function () {
            // Create an inbound FILE message WITH local blob data via the model path.
            const messageId = randomMessageId(services.crypto);
            const fileData = {
                fileId: randomFileId(services.crypto),
                encryptionKey: randomFileEncryptionKey(services.crypto),
                unencryptedByteCount: 123,
                storageFormatVersion: FILE_STORAGE_FORMAT.V1,
            };
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.INBOUND,
                type: 'file',
                id: messageId,
                sender: conversation.get().controller.receiver().ctx as DbContactUid,
                createdAt: new Date(),
                receivedAt: new Date(),
                readAt: new Date(),
                raw: new Uint8Array(0),
                fileName: 'doc.pdf',
                fileSize: 123,
                mediaType: 'application/pdf',
                encryptionKey: randomBlobKey(),
                fileData,
            });

            const store = conversation.get().controller.getMessage(messageId);
            assert(store !== undefined && store.type !== 'deleted');
            const messageUid = store.get().controller.uid;

            // Spy on blob deletion + on any task scheduling (a disappear must be LOCAL-ONLY).
            const fileDeleteSpy = spy(services.file, 'delete');
            const scheduleSpy = spy(services.taskManager, 'schedule');

            // Disappear it — exactly what the sweep engine calls.
            conversation.get().controller.markMessageAsDisappeared(messageId, new Date());

            // (a) The master `messages` row is GONE — a SELECT by uid returns NOTHING (not a
            // type='deleted' tombstone).
            expect(services.model.db.getMessageByUid(messageUid), 'row hard-purged').to.be
                .undefined;

            // (b) The blob FileId was freed (deleteFilesInBackground -> file.delete(fileId)).
            expect(
                fileDeleteSpy.getCalls().some((call) => call.args[0] === fileData.fileId),
                'blob FileId freed',
            ).to.be.true;

            // (c) LOCAL-ONLY: no outgoing delete task / no reflect / no task of any kind scheduled.
            expect(scheduleSpy.callCount, 'no wire task scheduled (local-only)').to.equal(0);

            // (d) The conversation no longer contains the message — no deleted placeholder renders.
            expect(
                conversation.get().controller.getMessage(messageId),
                'no deleted placeholder in the conversation',
            ).to.be.undefined;
            expect(conversation.get().controller.hasMessage(messageId), 'message not present').to.be
                .false;
        });
    });

    /**
     * F1Whisper fork: GROUP disappearing-timer convergence (Option X — Android v6.4.3-29 parity).
     *
     * Groups use the SINGLE shared field (`ephemeralTimerSeconds`) for BOTH outgoing and incoming
     * freezing; the per-direction PEER column is dead for groups. An incoming 0x95 adopts the value
     * UNCONDITIONALLY (pure last-writer-wins, OFF included) and the per-member piggyback re-assert is
     * removed (a 0x95 is sent ONLY on a genuine user change).
     */
    describe('Conversation model: GROUP disappearing timer (single shared field, LWW)', function () {
        const me = makeTestUser('MEMEMEME');
        const member = makeTestUser('GMEMBER1');
        const memberIdentity = ensureIdentityString('GMEMBER1');
        const member2 = makeTestUser('GMEMBER2');
        const member2Identity = ensureIdentityString('GMEMBER2');

        let services: TestServices;
        let memberContact: ModelStore<Contact>;
        let group: ModelStore<Group>;
        let conversation: ModelStore<Conversation>;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            memberContact = addTestUserAsContact(services.model, member);
            // A second member is added so a same-value advert from a DIFFERENT identity can be tested.
            addTestUserAsContact(services.model, member2);
            group = addTestGroup(services.model, {
                creator: 'me',
                members: [memberContact],
            });
            conversation = group.get().controller.conversation();
        });

        this.afterEach(function () {
            restore();
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        function view(): {
            readonly my: number | undefined;
            readonly peer: number | undefined;
        } {
            const v = conversation.get().view;
            return {my: v.ephemeralTimerSeconds, peer: v.peerEphemeralTimerSeconds};
        }

        function disappearingStatusCount(): number {
            return [...conversation.get().controller.getAllStatusMessages().get()].filter(
                (s) => s.type === StatusMessageType.DISAPPEARING_TIMER_CHANGED,
            ).length;
        }

        // A group inbound message's `sender` is a MEMBER contact's UID (not the group receiver).
        function addInboundGroupText(
            id = randomMessageId(services.crypto),
        ): ModelStore<Conversation> {
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.INBOUND,
                type: 'text',
                id,
                text: 'hi group',
                sender: memberContact.ctx as DbContactUid,
                createdAt: new Date(),
                receivedAt: new Date(),
                raw: new Uint8Array(0),
            });
            return conversation;
        }

        function lastInboundMessageView(id: ReturnType<typeof randomMessageId>): {
            readonly frozen: number | undefined;
        } {
            const store = conversation.get().controller.getMessage(id);
            assert(store !== undefined && store.type !== 'deleted');
            return {frozen: store.get().view.disappearingTimerSeconds};
        }

        // (a) Incoming 0x95 adopts UNCONDITIONALLY and overwrites a prior positive value.
        it('incoming group advert adopts the shared field unconditionally (overwrites a prior value)', function () {
            expect(view()).to.deep.equal({my: undefined, peer: undefined});

            // First member advert (30s): shared field becomes 30; PEER column untouched.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, memberIdentity, new Date());
            expect(view()).to.deep.equal({my: 30, peer: undefined});

            // A later advert (300s) from any member OVERWRITES unconditionally (pure LWW) — the 1:1
            // "adopt-if-unset / never overwrite a positive MY" rule does NOT apply to groups.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(300, member2Identity, new Date());
            expect(view()).to.deep.equal({my: 300, peer: undefined});
        });

        // (b) OFF adopted UNCONDITIONALLY (stores undefined, not 0; never the PEER column).
        it('incoming group OFF advert is adopted unconditionally (shared field -> undefined)', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(120, memberIdentity, new Date());
            expect(view()).to.deep.equal({my: 120, peer: undefined});

            // A member turns it OFF: shared field becomes undefined (NOT 0); PEER stays untouched.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, member2Identity, new Date());
            expect(view()).to.deep.equal({my: undefined, peer: undefined});
        });

        // (c) Inbound group message freezes from the SHARED field (not the PEER column).
        it('inbound group message freezes from the shared field', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(45, memberIdentity, new Date());

            const incomingId = randomMessageId(services.crypto);
            addInboundGroupText(incomingId);
            expect(
                lastInboundMessageView(incomingId).frozen,
                'group inbound frozen from the shared field',
            ).to.equal(45);
        });

        // (d) A second member's same-value advert is a re-assert -> NO duplicate status row.
        it('a same-value advert from another member is a re-assert (no duplicate status row)', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(60, memberIdentity, new Date());
            expect(disappearingStatusCount(), 'first advert adds a status row').to.equal(1);

            // Different identity, SAME value -> re-assert: shared field unchanged, no new row.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(60, member2Identity, new Date());
            expect(disappearingStatusCount(), 'same-value re-assert is de-duped').to.equal(1);
            expect(view().my).to.equal(60);

            // A genuine change does add a row.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(120, member2Identity, new Date());
            expect(disappearingStatusCount(), 'a real change adds a row').to.equal(2);
            expect(view().my).to.equal(120);
        });

        // (e) No group DisappearingTimer task is piggybacked on an outgoing group content send.
        it('does NOT piggyback a disappearing-timer task on an outgoing group content send', async function () {
            // Adopt a positive shared timer (the 1:1 path WOULD piggyback at this point).
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, memberIdentity, new Date());

            const scheduleSpy = spy(services.taskManager, 'schedule');

            await conversation.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id: randomMessageId(services.crypto),
                text: 'group out',
                createdAt: new Date(),
            });

            // The outgoing content message itself schedules a conversation-message task, but NO
            // DisappearingTimer (re-assert) task may be scheduled for groups.
            const disappearingTimerSchedules = scheduleSpy
                .getCalls()
                .filter((call) =>
                    (
                        call.args[0] as {readonly constructor: {readonly name: string}}
                    ).constructor.name.includes('DisappearingTimer'),
                ).length;
            expect(disappearingTimerSchedules, 'no group piggyback re-assert task').to.equal(0);
        });
    });
}
