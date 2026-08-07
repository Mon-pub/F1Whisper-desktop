import {expect} from 'chai';
import {restore, spy, stub} from 'sinon';

import type {DbContactUid} from '~/common/db';
import {MessageDirection, StatusMessageType} from '~/common/enum';
import {randomFileEncryptionKey, randomFileId} from '~/common/file-storage';
import type {Contact, Conversation, Group} from '~/common/model';
import type {ConversationControllerHandle} from '~/common/model/types/conversation';
import type {ModelStore} from '~/common/model/utils/model-store';
import {F1_DISAPPEARING_TIMER_MAX_SECONDS} from '~/common/network/protocol/disappearing-message-metadata';
import type {PassiveTaskCodecHandle} from '~/common/network/protocol/task';
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
 * F1Whisper fork: one shared contact disappearing timer with unconditional last-writer-wins.
 */
export function run(): void {
    describe('Conversation model: shared contact disappearing timer', function () {
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
        } {
            const v = conversation.get().view;
            return {my: v.ephemeralTimerSeconds};
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

        function addInboundText(
            id = randomMessageId(services.crypto),
            senderDisappearingTimerSeconds?: number,
        ): ModelStore<Conversation> {
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.INBOUND,
                type: 'text',
                id,
                text: 'hi',
                sender: conversation.get().controller.receiver().ctx as DbContactUid,
                createdAt: new Date(),
                receivedAt: new Date(),
                raw: new Uint8Array(0),
                senderDisappearingTimerSeconds,
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

        // --- Incoming controls replace the one shared field unconditionally -------------------

        it('incoming advertisement writes the shared field', function () {
            expect(view()).to.deep.equal({my: undefined});

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: 30});
        });

        it('incoming controls overwrite prior local values, including explicit OFF', function () {
            setMyTimerFireAndForget(60);
            expect(view().my).to.equal(60);

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: 30});

            setMyTimerFireAndForget(0);
            expect(view()).to.deep.equal({my: 0});

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: undefined});

            // Accepted mixed-version residual: a stale positive control is still authoritative.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(45, peerIdentity, new Date());
            expect(view()).to.deep.equal({my: 45});
        });

        // --- Both freeze directions use the shared field --------------------------------------

        it('a local OFF governs new inbound freezes without changing already-frozen messages', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());

            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(30);

            setMyTimerFireAndForget(0);
            expect(view()).to.deep.equal({my: 0});

            const incoming2Id = randomMessageId(services.crypto);
            addInboundText(incoming2Id);
            expect(
                lastInboundMessageView(incoming2Id).frozen,
                'new incoming freezes from shared OFF',
            ).to.equal(0);

            expect(lastInboundMessageView(incomingId).frozen).to.equal(30);
        });

        it('incoming freeze reads a locally selected shared timer', function () {
            setMyTimerFireAndForget(45);
            expect(view()).to.deep.equal({my: 45});

            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(45);
        });

        it('incoming freeze applies when the peer changes the shared timer', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(20, peerIdentity, new Date());
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(20);
        });

        it('prefers explicit sender OFF over an active local shared timer, including at read time', async function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId, 0);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(0);

            await conversation.get().controller.read.fromLocal(new Date());
            expect(lastInboundMessageView(incomingId).expiresAt).to.be.undefined;
        });

        it('prefers a positive sender timer over local OFF and later setting changes', function () {
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId, 30);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(30);

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(300, peerIdentity, new Date());
            expect(lastInboundMessageView(incomingId).frozen).to.equal(30);
        });

        it('clamps oversized sender metadata before persistence', function () {
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId, 0xffffffff);
            expect(lastInboundMessageView(incomingId).frozen).to.equal(
                F1_DISAPPEARING_TIMER_MAX_SECONDS,
            );
        });

        it('outgoing freeze reads the same shared field', function () {
            setMyTimerFireAndForget(25);
            const id = randomMessageId(services.crypto);
            const createdAt = new Date();
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id,
                text: 'out',
                createdAt,
            });

            const store = conversation.get().controller.getMessage(id);
            assert(store !== undefined && store.type !== 'deleted');
            expect(store.get().view.disappearingTimerSeconds).to.equal(25);
            expect(store.get().view.expiresAt?.getTime()).to.equal(createdAt.getTime() + 25 * 1000);
        });

        it('freezes outgoing OFF explicitly so every content message can advertise a policy', function () {
            const id = randomMessageId(services.crypto);
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id,
                text: 'out',
                createdAt: new Date(),
            });

            const store = conversation.get().controller.getMessage(id);
            assert(store !== undefined && store.type !== 'deleted');
            expect(store.get().view.disappearingTimerSeconds).to.equal(0);
            expect(store.get().view.expiresAt).to.be.undefined;
        });

        it('lets frozen 0 win while only legacy undefined falls back to the shared timer', function () {
            setMyTimerFireAndForget(30);
            const handle = Reflect.get(conversation.get().controller, '_handle') as
                | ConversationControllerHandle
                | undefined;
            assert(handle !== undefined);
            const readAt = new Date();

            expect(
                handle.computeInboundReadDisappearingStamp(0, readAt),
                'frozen OFF is authoritative',
            ).to.be.undefined;
            expect(
                handle.computeInboundReadDisappearingStamp(undefined, readAt)?.expiresAt,
                'legacy missing freeze falls back to shared timer',
            ).to.deep.equal(new Date(readAt.getTime() + 30 * 1000));
        });

        // --- P-H04: a message received while off is frozen off (0) and never gets a late expiry ---

        it('freezes an inbound message received while off, and enabling later gives it no expiry', async function () {
            // Shared timer is unset: an inbound-unread message is frozen explicitly OFF (0), not
            // left undefined.
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(
                lastInboundMessageView(incomingId).frozen,
                'frozen explicitly off (0) at receive',
            ).to.equal(0);

            // The shared timer is enabled after receipt but before first read.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(60, peerIdentity, new Date());
            expect(view().my).to.equal(60);

            // First read must NOT retroactively assign an expiry: the frozen `0` wins over the live
            // timer, so the message keeps living.
            await conversation.get().controller.read.fromLocal(new Date());
            const after = lastInboundMessageView(incomingId);
            expect(after.frozen, 'still frozen off after read').to.equal(0);
            expect(after.expiresAt, 'no retroactive expiry from a later enable').to.be.undefined;
        });

        it('preserves the frozen-off model sentinel but omits disappearing UI metadata', function () {
            const offMessageId = randomMessageId(services.crypto);
            addInboundText(offMessageId);
            const offMessageStore = conversation.get().controller.getMessage(offMessageId);
            assert(offMessageStore !== undefined && offMessageStore.type !== 'deleted');

            expect(
                offMessageStore.get().view.disappearingTimerSeconds,
                'model keeps the explicit frozen-off sentinel',
            ).to.equal(0);
            expect(
                services.viewModel
                    .conversationRegularMessage(conversation, offMessageStore)
                    .viewModelStore.get().disappearing,
                'view model suppresses the disappearing badge for frozen-off messages',
            ).to.be.undefined;

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(20, peerIdentity, new Date());
            const expiringMessageId = randomMessageId(services.crypto);
            addInboundText(expiringMessageId);
            const expiringMessageStore = conversation
                .get()
                .controller.getMessage(expiringMessageId);
            assert(expiringMessageStore !== undefined && expiringMessageStore.type !== 'deleted');
            expect(
                services.viewModel
                    .conversationRegularMessage(conversation, expiringMessageStore)
                    .viewModelStore.get().disappearing?.timerSeconds,
                'positive frozen timers still reach the UI',
            ).to.equal(20);
        });

        it('publishes the started expiry into the message view on first read (P-H05)', async function () {
            // Peer timer on (20s): an inbound message freezes 20 at receive but does not start its
            // countdown until read.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(20, peerIdentity, new Date());
            const incomingId = randomMessageId(services.crypto);
            addInboundText(incomingId);
            expect(lastInboundMessageView(incomingId).expiresAt, 'not yet expiring before read').to
                .be.undefined;

            const readAt = new Date();
            await conversation.get().controller.read.fromLocal(readAt);

            const v = lastInboundMessageView(incomingId);
            expect(v.frozen, 'frozen timer preserved').to.equal(20);
            expect(v.expiresAt, 'expiry published into the reactive view on read').to.not.be
                .undefined;
            expect(v.expiresAt?.getTime(), 'expiry = readAt + 20s').to.equal(
                readAt.getTime() + 20 * 1000,
            );
        });

        it('atomically stamps EVERY read message (none left read-but-unstamped) [P-H05]', async function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            // Several unread inbound messages, each frozen at 30s at receive.
            const ids = [
                randomMessageId(services.crypto),
                randomMessageId(services.crypto),
                randomMessageId(services.crypto),
            ];
            for (const id of ids) {
                addInboundText(id);
                expect(lastInboundMessageView(id).expiresAt, 'not expiring before read').to.be
                    .undefined;
            }

            const readAt = new Date();
            await conversation.get().controller.read.fromLocal(readAt);

            // The single atomic transaction guarantees every read message is stamped together with
            // its `readAt` -- none is left read-but-unstamped (which would never disappear).
            for (const id of ids) {
                const v = lastInboundMessageView(id);
                expect(v.frozen, 'frozen preserved').to.equal(30);
                expect(v.expiresAt?.getTime(), 'expiry stamped atomically with read').to.equal(
                    readAt.getTime() + 30 * 1000,
                );
            }
        });

        it('stamps expiry on the reflected/sync read path (read.fromSync) too [P-H05]', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            const id = randomMessageId(services.crypto);
            addInboundText(id);

            const messageStore = conversation.get().controller.getMessage(id);
            assert(messageStore !== undefined && messageStore.type !== 'deleted');
            const readAt = new Date();
            // The reflected/sync read path (used when a linked follower processes a reflected read
            // receipt) must also stamp the expiry; it previously never did.
            messageStore
                .get()
                .controller.read.fromSync(undefined as unknown as PassiveTaskCodecHandle, readAt);

            expect(
                lastInboundMessageView(id).expiresAt?.getTime(),
                'reflected read stamps expiry',
            ).to.equal(readAt.getTime() + 30 * 1000);
        });

        it('rolls back the read-mark when expiry-stamping fails mid-transaction (no read-but-unstamped) [P-H05]', async function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            const id = randomMessageId(services.crypto);
            addInboundText(id);
            const store = conversation.get().controller.getMessage(id);
            assert(store !== undefined && store.type !== 'deleted');
            const messageUid = store.get().controller.uid;
            const {db} = services.model;
            expect(db.getMessageByUid(messageUid)?.readAt, 'message is unread before the read').to
                .be.undefined;

            // Inject a failure at the per-message expiry stamp, which runs INSIDE the same
            // transaction right after the conversation was marked read. This simulates a
            // crash/power-loss between the two writes.
            const injectedFailure = new Error('injected expiry-stamp failure');
            stub(db, 'stampMessageExpiry').throws(injectedFailure);

            let caught: unknown;
            try {
                await conversation.get().controller.read.fromLocal(new Date());
            } catch (error) {
                caught = error;
            }
            expect(caught, 'the injected failure propagates out of read.fromLocal').to.equal(
                injectedFailure,
            );

            // The whole transaction rolled back: the committed row is NEITHER read NOR stamped. A
            // split (non-transactional) implementation would have committed the read-mark before
            // the stamp threw, leaving a read-but-unstamped message that never disappears, so this
            // assertion fails if the two writes are ever un-bundled.
            const committed = db.getMessageByUid(messageUid);
            assert(committed !== undefined);
            expect(committed.readAt, 'read-mark rolled back with the failed stamp').to.be.undefined;
            expect(committed.expiresAt, 'no expiry stamped after rollback').to.be.undefined;
        });

        it('wraps the read-mark and every expiry-stamp in one transaction (fails if split) [P-H05]', async function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            addInboundText(randomMessageId(services.crypto));

            const {db} = services.model;

            // Track transaction nesting so we can prove the read-mark and the per-message expiry
            // stamp both run INSIDE the same runInTransaction executor. If the implementation ever
            // reverts to two sequential non-transactional writes, these flags stay false and the
            // assertions below fail.
            let transactionDepth = 0;
            const runInTransactionOriginal = db.runInTransaction.bind(db);
            const runInTransactionSpy = stub(db, 'runInTransaction').callsFake(
                (executor: () => unknown): unknown => {
                    transactionDepth += 1;
                    try {
                        return runInTransactionOriginal(executor);
                    } finally {
                        transactionDepth -= 1;
                    }
                },
            );

            let readMarkInsideTransaction: boolean | undefined;
            const markConversationAsReadOriginal = db.markConversationAsRead.bind(db);
            stub(db, 'markConversationAsRead').callsFake((conversationUid, readAt) => {
                readMarkInsideTransaction = transactionDepth > 0;
                return markConversationAsReadOriginal(conversationUid, readAt);
            });

            let expiryStampInsideTransaction: boolean | undefined;
            const stampMessageExpiryOriginal = db.stampMessageExpiry.bind(db);
            stub(db, 'stampMessageExpiry').callsFake((messageUid, stamp) => {
                expiryStampInsideTransaction = transactionDepth > 0;
                stampMessageExpiryOriginal(messageUid, stamp);
            });

            await conversation.get().controller.read.fromLocal(new Date());

            expect(
                runInTransactionSpy.calledOnce,
                'read + expiry stamping used exactly one transaction',
            ).to.be.true;
            expect(readMarkInsideTransaction, 'the read-mark ran inside the transaction').to.equal(
                true,
            );
            expect(
                expiryStampInsideTransaction,
                'the expiry stamp ran inside the transaction',
            ).to.equal(true);
        });

        // --- Status normalization and authoritative intent invalidation -----------------------

        it('a same-value authoritative control invalidates local intent without a status row', function () {
            setMyTimerFireAndForget(30);
            expect(disappearingStatusCount()).to.equal(1);
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(1);

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, peerIdentity, new Date());
            expect(disappearingStatusCount(), 'same normalized value is de-duplicated').to.equal(1);
            expect(view()).to.deep.equal({my: 30});
            expect(
                services.model.db.getPendingContactDisappearingTimers(),
                'authoritative same-value control invalidates local intent',
            ).to.have.length(0);

            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(60, peerIdentity, new Date());
            expect(disappearingStatusCount(), 'real change adds a row').to.equal(2);
        });

        it('normalizes undefined and 0 as OFF for authoritative status de-duplication', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            expect(disappearingStatusCount()).to.equal(0);
            expect(view()).to.deep.equal({my: undefined});

            // A genuine local explicit OFF remains 0 and creates durable intent.
            setMyTimerFireAndForget(0);
            expect(view().my).to.equal(0);
            expect(disappearingStatusCount()).to.equal(1);
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(1);

            // Authoritative OFF switches storage back to undefined, but the governing value did not
            // change. It therefore emits no row while still invalidating intent.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, peerIdentity, new Date());
            expect(view().my).to.be.undefined;
            expect(disappearingStatusCount()).to.equal(1);
            expect(services.model.db.getPendingContactDisappearingTimers()).to.have.length(0);
        });

        it('does not synthesize a contact timer control on an ordinary outgoing message', async function () {
            setMyTimerFireAndForget(30);
            const scheduleSpy = spy(services.taskManager, 'schedule');
            await conversation.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id: randomMessageId(services.crypto),
                text: 'out',
                createdAt: new Date(),
            });
            const timerTasks = scheduleSpy
                .getCalls()
                .filter((call) =>
                    (
                        call.args[0] as {readonly constructor: {readonly name: string}}
                    ).constructor.name.includes('DisappearingTimer'),
                );
            expect(timerTasks).to.have.length(0);
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
        } {
            const v = conversation.get().view;
            return {my: v.ephemeralTimerSeconds};
        }

        function disappearingStatusCount(): number {
            return [...conversation.get().controller.getAllStatusMessages().get()].filter(
                (s) => s.type === StatusMessageType.DISAPPEARING_TIMER_CHANGED,
            ).length;
        }

        // A group inbound message's `sender` is a MEMBER contact's UID (not the group receiver).
        function addInboundGroupText(
            id = randomMessageId(services.crypto),
            senderDisappearingTimerSeconds?: number,
        ): ModelStore<Conversation> {
            conversation.get().controller.addMessage.direct({
                direction: MessageDirection.INBOUND,
                type: 'text',
                id,
                text: 'hi group',
                sender: memberContact.ctx,
                createdAt: new Date(),
                receivedAt: new Date(),
                raw: new Uint8Array(0),
                senderDisappearingTimerSeconds,
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
            expect(view()).to.deep.equal({my: undefined});

            // First member advert (30s): shared field becomes 30; PEER column untouched.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(30, memberIdentity, new Date());
            expect(view()).to.deep.equal({my: 30});

            // A later advert (300s) from any member OVERWRITES unconditionally (pure LWW) — the 1:1
            // "adopt-if-unset / never overwrite a positive MY" rule does NOT apply to groups.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(300, member2Identity, new Date());
            expect(view()).to.deep.equal({my: 300});
        });

        // (b) OFF adopted UNCONDITIONALLY (stores undefined, not 0; never the PEER column).
        it('incoming group OFF advert is adopted unconditionally (shared field -> undefined)', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(120, memberIdentity, new Date());
            expect(view()).to.deep.equal({my: 120});

            // A member turns it OFF: shared field becomes undefined (NOT 0); PEER stays untouched.
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(0, member2Identity, new Date());
            expect(view()).to.deep.equal({my: undefined});
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

        it('inbound group messages prefer sender metadata, including explicit OFF', function () {
            conversation
                .get()
                .controller.updateEphemeralTimer.fromRemote(45, memberIdentity, new Date());

            const positiveId = randomMessageId(services.crypto);
            addInboundGroupText(positiveId, 30);
            expect(lastInboundMessageView(positiveId).frozen).to.equal(30);

            const offId = randomMessageId(services.crypto);
            addInboundGroupText(offId, 0);
            expect(lastInboundMessageView(offId).frozen).to.equal(0);
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
