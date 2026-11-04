import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';
import {expect} from 'chai';
import {restore, stub, type SinonStub} from 'sinon';

import type {DatabaseBackend, DbConversationUid, DbFileData} from '~/common/db';
import {ConnectionState, MessageDirection, MessageType} from '~/common/enum';
import type {Contact, Conversation} from '~/common/model';
import {deactivateAndPurgeCacheCascade} from '~/common/model/conversation';
import {dispatchOutgoingMessage} from '~/common/model/f1-outgoing-message-dispatch';
import {
    getOutgoingPreparationLane,
    LARGE_UPLOAD_BYTES,
    MAX_CONCURRENT_UPLOADS,
    OutgoingPreparationLane,
} from '~/common/model/f1-outgoing-preparation-lane';
import {stopOutgoingUploads} from '~/common/model/f1-outgoing-shutdown';
import {getUploadIssuePins} from '~/common/model/f1-upload-issue-pins';
import {
    enrollOutgoingMessageInOutbox,
    recoverOutgoingMessageOutbox,
} from '~/common/model/outgoing-message-outbox';
import type {ServicesForModel} from '~/common/model/types/common';
import type {AnyOutboundNonDeletedMessageModelStore} from '~/common/model/types/message';
import type {ModelStore} from '~/common/model/utils/model-store';
import {
    BlobBackendError,
    type BlobId,
    type BlobUploadOptions,
    ensureBlobId,
} from '~/common/network/protocol/blob';
import {getBlobUploadCoordinator} from '~/common/network/protocol/f1-blob-upload-coordinator';
import {randomMessageId} from '~/common/network/protocol/utils';
import type {MessageId} from '~/common/network/types';
import {assert} from '~/common/utils/assert';
import {getMessageStatusData} from '~/common/viewmodel/conversation/main/message/helpers';
import {
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {createFileMessage} from '~/test/mocha/common/db-backend-tests';

async function sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

const CONVERSATION_A = 1n as DbConversationUid;
const CONVERSATION_B = 2n as DbConversationUid;

/**
 * A lane job that stays pending until released, and records when it started.
 */
function controllableJob(): {
    readonly job: () => Promise<void>;
    readonly started: () => boolean;
    readonly release: () => void;
} {
    const gate = new ResolvablePromise<void>({uncaught: 'discard'});
    let didStart = false;
    async function job(): Promise<void> {
        didStart = true;
        await gate;
    }
    return {
        job,
        started: () => didStart,
        release: () => gate.resolve(undefined),
    };
}

/**
 * The preparation lane (F1Whisper fork): ordering, bounded concurrency, no poisoning, accounting.
 */
function runLaneTests(): void {
    describe('OutgoingPreparationLane', function () {
        let lane: OutgoingPreparationLane;
        let errors: unknown[];

        function onError(error: unknown): void {
            errors.push(error);
        }

        this.beforeEach(function () {
            lane = new OutgoingPreparationLane();
            errors = [];
        });

        it('starts a job synchronously when nothing is queued for its conversation', function () {
            const job = controllableJob();
            lane.enqueue(CONVERSATION_A, job.job, onError);
            expect(job.started(), 'no tick between enqueue and start').to.equal(true);
            job.release();
        });

        it('runs the jobs of one conversation strictly in order', async function () {
            const first = controllableJob();
            const second = controllableJob();
            const third = controllableJob();
            lane.enqueue(CONVERSATION_A, first.job, onError);
            lane.enqueue(CONVERSATION_A, second.job, onError);
            lane.enqueue(CONVERSATION_A, third.job, onError);
            await sleep(5);

            expect([first.started(), second.started(), third.started()]).to.deep.equal([
                true,
                false,
                false,
            ]);
            first.release();
            await sleep(5);
            expect([second.started(), third.started()]).to.deep.equal([true, false]);
            second.release();
            await sleep(5);
            expect(third.started()).to.equal(true);
            third.release();
        });

        it('does not make one conversation wait for another', async function () {
            const blocked = controllableJob();
            const other = controllableJob();
            lane.enqueue(CONVERSATION_A, blocked.job, onError);
            lane.enqueue(CONVERSATION_B, other.job, onError);
            await sleep(5);

            expect(other.started()).to.equal(true);
            blocked.release();
            other.release();
        });

        it('a job that throws does not poison the jobs behind it', async function () {
            const failure = new Error('boom');
            lane.enqueue(
                CONVERSATION_A,
                async () => {
                    await Promise.resolve();
                    throw failure;
                },
                onError,
            );
            const next = controllableJob();
            lane.enqueue(CONVERSATION_A, next.job, onError);
            await sleep(5);

            expect(errors).to.deep.equal([failure]);
            expect(next.started(), 'the job behind a failed job still runs').to.equal(true);
            next.release();
        });

        it('counts pending jobs and drains', async function () {
            const job = controllableJob();
            lane.enqueue(CONVERSATION_A, job.job, onError);
            lane.enqueue(CONVERSATION_A, async () => await Promise.resolve(), onError);
            expect(lane.pendingCount).to.equal(2);

            const draining = lane.drain(1000);
            job.release();

            expect(await draining).to.equal(0);
            expect(lane.pendingCount).to.equal(0);
        });

        it('drain gives up at the timeout and reports what is still pending', async function () {
            const job = controllableJob();
            lane.enqueue(CONVERSATION_A, job.job, onError);

            expect(await lane.drain(20)).to.equal(1);
            job.release();
            expect(await lane.drain(1000)).to.equal(0);
        });

        it('shutdown is a visible flag', function () {
            expect(lane.isShutdown).to.equal(false);
            lane.shutdown();
            expect(lane.isShutdown).to.equal(true);
        });

        describe('upload slots', function () {
            /** Starts `count` slot-holding jobs and returns how many run at the same time. */
            async function startSlotJobs(
                sizes: readonly number[],
            ): Promise<{running: () => number; peak: () => number; releaseAll: () => void}> {
                let running = 0;
                let peak = 0;
                const gate = new ResolvablePromise<void>({uncaught: 'discard'});
                sizes.forEach((bytes, index) => {
                    lane.enqueue(
                        BigInt(100 + index) as DbConversationUid,
                        async () =>
                            await lane.withUploadSlot(bytes, async () => {
                                running += 1;
                                peak = Math.max(peak, running);
                                await gate;
                                running -= 1;
                            }),
                        onError,
                    );
                });
                await sleep(5);
                return {
                    running: () => running,
                    peak: () => peak,
                    releaseAll: () => gate.resolve(undefined),
                };
            }

            it('bounds the number of concurrent uploads', async function () {
                const jobs = await startSlotJobs(
                    new Array<number>(MAX_CONCURRENT_UPLOADS + 3).fill(10),
                );

                expect(jobs.running()).to.equal(MAX_CONCURRENT_UPLOADS);
                jobs.releaseAll();
                expect(await lane.drain(1000)).to.equal(0);
                expect(jobs.peak()).to.equal(MAX_CONCURRENT_UPLOADS);
            });

            it('runs at most one large upload at a time, without blocking small ones', async function () {
                const large = LARGE_UPLOAD_BYTES + 1;
                const jobs = await startSlotJobs([large, large, 10]);

                // The second large upload waits; the small one behind it is not held up.
                expect(jobs.running()).to.equal(2);
                jobs.releaseAll();
                expect(await lane.drain(1000)).to.equal(0);
                expect(jobs.peak()).to.equal(2);
            });

            it('a waiter that is cancelled leaves the queue and is never granted a slot', async function () {
                const held = await Promise.all(
                    new Array<number>(MAX_CONCURRENT_UPLOADS)
                        .fill(10)
                        .map(async (bytes) => await lane.acquireUploadSlot(bytes)),
                );
                const controller = new AbortController();
                const waiting = lane.acquireUploadSlot(10, controller.signal);
                await sleep(5);

                controller.abort(new Error('message deleted'));

                const error: unknown = await waiting.catch((caught: unknown) => caught);
                expect((error as Error).message).to.equal('message deleted');
                // A slot frees up: the next real waiter gets it, the cancelled one must not take it.
                held[0]?.();
                const next = await lane.acquireUploadSlot(10);
                next();
                for (const release of held) {
                    release();
                }
                const all = await Promise.all(
                    new Array<number>(MAX_CONCURRENT_UPLOADS)
                        .fill(10)
                        .map(async (bytes) => await lane.acquireUploadSlot(bytes)),
                );
                expect(all, 'every slot is free again, none leaked').to.have.length(
                    MAX_CONCURRENT_UPLOADS,
                );
            });

            it('an already cancelled waiter does not take a slot', async function () {
                const controller = new AbortController();
                controller.abort(new Error('already gone'));

                const error: unknown = await lane
                    .acquireUploadSlot(10, controller.signal)
                    .catch((caught: unknown) => caught);

                expect((error as Error).message).to.equal('already gone');
                const all = await Promise.all(
                    new Array<number>(MAX_CONCURRENT_UPLOADS)
                        .fill(10)
                        .map(async (bytes) => await lane.acquireUploadSlot(bytes)),
                );
                expect(all).to.have.length(MAX_CONCURRENT_UPLOADS);
            });

            it('a slot is released only once even if release is called twice', async function () {
                const first = await lane.acquireUploadSlot(10);
                first();
                first();
                const rest = await Promise.all(
                    new Array<number>(MAX_CONCURRENT_UPLOADS)
                        .fill(10)
                        .map(async (bytes) => await lane.acquireUploadSlot(bytes)),
                );
                // One more would block if the double release had freed a phantom slot.
                const extra = lane.acquireUploadSlot(10);
                await sleep(5);
                rest[0]?.();
                await extra;
            });

            it('releases the slot when the upload fails', async function () {
                const results: string[] = [];
                async function failingUpload(): Promise<void> {
                    await lane
                        .withUploadSlot(10, async () => {
                            await Promise.resolve();
                            throw new Error('upload failed');
                        })
                        .catch(() => results.push('failed'));
                }
                for (let index = 0; index < MAX_CONCURRENT_UPLOADS + 2; index++) {
                    lane.enqueue(BigInt(200 + index) as DbConversationUid, failingUpload, onError);
                }

                expect(await lane.drain(1000)).to.equal(0);
                expect(results).to.have.length(MAX_CONCURRENT_UPLOADS + 2);
            });
        });
    });
}

/**
 * Dispatch of outgoing messages through the lane, against real model services and a blob backend
 * whose uploads stay pending until the test settles them.
 */
function runDispatchTests(): void {
    describe('dispatchOutgoingMessage', function () {
        const me = makeTestUser('MEMEMEME');
        const anotherUser = makeTestUser('USER0001');

        let services: TestServices;
        let contact: ModelStore<Contact>;
        let conversation: ModelStore<Conversation>;
        let scheduleStub: SinonStub;
        let uploads: {
            readonly signal: AbortSignal | undefined;
            readonly resolve: () => void;
            readonly reject: (error: Error) => void;
        }[];
        let originalUpload: TestServices['blob']['upload'];

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            contact = addTestUserAsContact(services.model, anotherUser);
            conversation = contact.get().controller.conversation();
            uploads = [];
            originalUpload = services.blob.upload.bind(services.blob);
            services.blob.upload = async (scope, data, options?: BlobUploadOptions) =>
                await new Promise<BlobId>((resolve, reject) => {
                    const blobId = ensureBlobId(new Uint8Array(16).fill(uploads.length + 1));
                    uploads.push({
                        signal: options?.signal,
                        resolve: () => resolve(blobId),
                        reject,
                    });
                });
            // A task manager that accepts tasks and never finishes them (like a disconnected one).
            scheduleStub = stub(services.taskManager, 'schedule').callsFake(
                async () =>
                    await new Promise<never>(() => {
                        // Never settles.
                    }),
            );
        });

        this.afterEach(function () {
            services.blob.upload = originalUpload;
            getBlobUploadCoordinator(services.blob).abortAll('teardown');
            restore();
        });

        function modelServices(): ServicesForModel {
            return {...services, db: services.model.db} as unknown as ServicesForModel;
        }

        function db(): DatabaseBackend {
            return services.model.db;
        }

        function log(): ReturnType<TestServices['logging']['logger']> {
            return services.logging.logger('test');
        }

        /** The message ids of the send tasks handed to the task manager, in order. */
        function scheduledMessageIds(): MessageId[] {
            return scheduleStub.args.map(
                ([task]) => Reflect.get(task as object, '_messageId') as MessageId,
            );
        }

        async function storedFileData(
            bytes: Uint8Array,
            declaredByteCount?: number,
        ): Promise<DbFileData> {
            const handle = await services.file.store(bytes);
            return {
                fileId: handle.fileId,
                encryptionKey: handle.encryptionKey,
                unencryptedByteCount: declaredByteCount ?? bytes.byteLength,
                storageFormatVersion: handle.storageFormatVersion,
            };
        }

        /** An enrolled outbound file message with main file and thumbnail, nothing uploaded yet. */
        async function addUnuploadedFileMessage(
            target: ModelStore<Conversation> = conversation,
            declaredMainByteCount?: number,
        ): Promise<MessageId> {
            const id = randomMessageId(services.crypto);
            createFileMessage(db(), {
                id,
                conversationUid: target.ctx,
                mediaType: 'application/pdf',
                fileName: 'report.pdf',
                fileSize: 64,
                blobId: undefined,
                fileData: await storedFileData(new Uint8Array(64).fill(1), declaredMainByteCount),
                thumbnailFileData: await storedFileData(new Uint8Array(16).fill(2)),
                thumbnailMediaType: 'image/jpeg',
            });
            enrollOutgoingMessageInOutbox(modelServices(), {
                messageId: id,
                conversationUid: target.ctx,
            });
            return id;
        }

        async function sendText(
            text: string,
            target: ModelStore<Conversation> = conversation,
        ): Promise<MessageId> {
            const id = randomMessageId(services.crypto);
            await target.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id,
                createdAt: new Date(),
                text,
            });
            return id;
        }

        async function untilUploadsStarted(count: number): Promise<void> {
            for (let attempt = 0; attempt < 100 && uploads.length < count; attempt++) {
                await sleep(1);
            }
            expect(uploads).to.have.length(count);
        }

        it('hands a text message to the task manager in the same tick (no lane delay)', async function () {
            const id = randomMessageId(services.crypto);
            const adding = conversation.get().controller.addMessage.fromLocal({
                direction: MessageDirection.OUTBOUND,
                type: 'text',
                id,
                createdAt: new Date(),
                text: 'hello',
            });
            await adding;

            expect(scheduledMessageIds()).to.deep.equal([id]);
        });

        it('uploads first and schedules the send task only after the upload finished', async function () {
            const id = await addUnuploadedFileMessage();

            dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
            await untilUploadsStarted(2);
            await sleep(10);
            expect(scheduledMessageIds(), 'nothing is queued while uploading').to.deep.equal([]);
            expect(getOutgoingPreparationLane(services.blob).pendingCount).to.equal(1);

            for (const upload of uploads) {
                upload.resolve();
            }
            expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);

            expect(scheduledMessageIds()).to.deep.equal([id]);
            expect(uploads).to.have.length(2);
        });

        it('keeps the order of a conversation: a text sent after a large file goes out after it', async function () {
            const fileId = await addUnuploadedFileMessage();
            dispatchOutgoingMessage(modelServices(), conversation.ctx, fileId, log());
            await untilUploadsStarted(2);

            const textId = await sendText('after the file');
            await sleep(10);
            expect(scheduledMessageIds(), 'the text waits behind the upload').to.deep.equal([]);

            for (const upload of uploads) {
                upload.resolve();
            }
            expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);

            expect(scheduledMessageIds()).to.deep.equal([fileId, textId]);
        });

        it('a reconnect while uploading does not start another upload (uploads are outside the task manager)', async function () {
            const id = await addUnuploadedFileMessage();
            dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
            await untilUploadsStarted(2);

            services.taskManager.replace(ConnectionState.CONNECTING);
            services.taskManager.replace(ConnectionState.DISCONNECTED);
            services.taskManager.replace(ConnectionState.CONNECTING);
            await sleep(20);

            expect(uploads, 'still exactly one request per blob').to.have.length(2);
            expect(uploads.every((upload) => upload.signal?.aborted === false)).to.equal(true);
            for (const upload of uploads) {
                upload.resolve();
            }
            await getOutgoingPreparationLane(services.blob).drain(1000);
        });

        describe('refusals and retries', function () {
            function refusal(status: number, body?: string): BlobBackendError {
                return new BlobBackendError('fetch', `Could not upload blob, status: ${status}`, {
                    status,
                    body,
                });
            }

            function lane(): OutgoingPreparationLane {
                return getOutgoingPreparationLane(services.blob);
            }

            /** Fast retries: every backoff is 5 ms, charged against a budget of `budgetMs`. */
            function useFastRetries(options: {budgetMs?: number} = {}): void {
                lane().retryTiming = {
                    backoffMs: () => 5,
                    budgetMs: options.budgetMs ?? 1_000_000,
                };
            }

            function rejectAllPending(error: Error): void {
                for (const upload of uploads.splice(0)) {
                    upload.reject(error);
                }
            }

            async function untilNewUploads(count: number): Promise<void> {
                for (let attempt = 0; attempt < 200 && uploads.length < count; attempt++) {
                    await sleep(2);
                }
                expect(uploads).to.have.length(count);
            }

            function issueOf(id: MessageId): unknown {
                const message = conversation.get().controller.getMessage(id);
                assert(message !== undefined && message.ctx === MessageDirection.OUTBOUND);
                return (message as AnyOutboundNonDeletedMessageModelStore).get().view.uploadIssue;
            }

            function sendFailedAtOf(id: MessageId): Date | undefined {
                const message = conversation.get().controller.getMessage(id);
                assert(message !== undefined && message.ctx === MessageDirection.OUTBOUND);
                return (message as AnyOutboundNonDeletedMessageModelStore).get().view.sendFailedAt;
            }

            for (const [status, body] of [
                [503, 'server busy'],
                [429, 'too many uploads'],
                [408, 'upload stalled'],
                [500, undefined],
            ] as const) {
                // The shared fixtures are only reassigned in `beforeEach`, never while a loop's tests run.
                // eslint-disable-next-line @typescript-eslint/no-loop-func
                it(`${status}${body === undefined ? '' : ` "${body}"`} is retried, shown as waiting, and then sent`, async function () {
                    useFastRetries();
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);

                    rejectAllPending(refusal(status, body));
                    await untilNewUploads(2);
                    expect(issueOf(id), 'the user sees that it is waiting').to.deep.equal({
                        kind: 'waiting',
                    });
                    expect(scheduledMessageIds()).to.deep.equal([]);

                    for (const upload of uploads) {
                        upload.resolve();
                    }
                    expect(await lane().drain(1000)).to.equal(0);

                    expect(scheduledMessageIds()).to.deep.equal([id]);
                    expect(issueOf(id), 'the waiting hint is gone again').to.equal(undefined);
                    expect(sendFailedAtOf(id)).to.equal(undefined);
                });
            }

            it('a network error (no HTTP status) is retried', async function () {
                useFastRetries();
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                rejectAllPending(new BlobBackendError('fetch', 'Fetch upload request errored'));
                await untilNewUploads(2);
                for (const upload of uploads) {
                    upload.resolve();
                }

                expect(await lane().drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([id]);
            });

            for (const [status, body, reason] of [
                [413, 'blob too large', 'too-large'],
                [507, 'storage full', 'storage-full'],
                [408, 'upload too slow', 'too-slow'],
            ] as const) {
                // The shared fixtures are only reassigned in `beforeEach`, never while a loop's tests run.
                // eslint-disable-next-line @typescript-eslint/no-loop-func
                it(`${status} "${body}" ends the send at once (${reason}), without retrying`, async function () {
                    useFastRetries();
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);

                    rejectAllPending(refusal(status, body));
                    expect(await lane().drain(1000)).to.equal(0);
                    await sleep(20);

                    expect(uploads, 'no further attempt').to.have.length(0);
                    expect(issueOf(id)).to.deep.equal({kind: 'failed', reason});
                    expect(sendFailedAtOf(id), 'the red indicator').to.be.instanceOf(Date);
                    expect(db().hasOutgoingMessageOutboxEntry(id), 'never recovered').to.equal(
                        false,
                    );
                    expect(scheduledMessageIds()).to.deep.equal([]);
                });
            }

            /**
             * The model cache holds message stores weakly. Collect garbage until nothing but a
             * deliberate strong reference could keep a store, like a quiet app would.
             */
            async function collectGarbage(): Promise<void> {
                for (let round = 0; round < 5; round++) {
                    await sleep(5);
                    (globalThis as unknown as {gc: () => void}).gc();
                }
            }

            it('a failure reason survives garbage collection of the message store', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);
                rejectAllPending(refusal(408, 'upload too slow'));
                expect(await lane().drain(1000)).to.equal(0);

                await collectGarbage();

                expect(issueOf(id)).to.deep.equal({kind: 'failed', reason: 'too-slow'});
                expect(sendFailedAtOf(id), 'the persisted failure is there too').to.be.instanceOf(
                    Date,
                );
            });

            it('the waiting hint survives garbage collection of the message store', async function () {
                lane().retryTiming = {backoffMs: () => 60_000, budgetMs: 1_000_000};
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);
                rejectAllPending(refusal(503, 'server busy'));
                for (let attempt = 0; attempt < 100 && issueOf(id) === undefined; attempt++) {
                    await sleep(2);
                }

                await collectGarbage();

                expect(issueOf(id)).to.deep.equal({kind: 'waiting'});
            });

            it('the hint is let go of when the upload goes through after all', async function () {
                useFastRetries();
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);
                rejectAllPending(refusal(503, 'server busy'));
                await untilNewUploads(2);
                for (const upload of uploads) {
                    upload.resolve();
                }
                expect(await lane().drain(1000)).to.equal(0);

                await collectGarbage();

                expect(issueOf(id), 'nothing to show, nothing kept').to.equal(undefined);
            });

            describe('the strong reference that keeps an issue alive', function () {
                function pinned(): number {
                    return getUploadIssuePins(services.blob).pinnedCount;
                }

                async function failTerminally(): Promise<MessageId> {
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);
                    rejectAllPending(refusal(413, 'blob too large'));
                    expect(await lane().drain(1000)).to.equal(0);
                    return id;
                }

                it('a terminally failed message is held while it exists', async function () {
                    const id = await failTerminally();

                    expect(pinned()).to.equal(1);
                    expect(issueOf(id)).to.deep.equal({kind: 'failed', reason: 'too-large'});
                });

                it('deleting a terminally failed message lets go of its store at once', async function () {
                    const id = await failTerminally();
                    expect(pinned()).to.equal(1);

                    conversation.get().controller.removeMessage.direct(id);

                    expect(pinned()).to.equal(0);
                });

                it('clearing the chat lets go of the stores of its failed messages', async function () {
                    await failTerminally();
                    expect(pinned()).to.equal(1);

                    conversation.get().controller.removeAllMessages.direct();

                    expect(pinned()).to.equal(0);
                });

                it('removing a conversation altogether lets go as well', async function () {
                    await failTerminally();
                    expect(pinned()).to.equal(1);

                    deactivateAndPurgeCacheCascade(
                        modelServices(),
                        conversation.get().controller.receiverLookup,
                        conversation,
                    );

                    expect(pinned()).to.equal(0);
                });

                it('a message that goes through after waiting is not held', async function () {
                    useFastRetries();
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);
                    rejectAllPending(refusal(503, 'server busy'));
                    await untilNewUploads(2);
                    expect(pinned(), 'held while waiting').to.equal(1);

                    for (const upload of uploads) {
                        upload.resolve();
                    }
                    expect(await lane().drain(1000)).to.equal(0);

                    expect(pinned()).to.equal(0);
                    expect(issueOf(id)).to.equal(undefined);
                });

                it('a message that is removed while it waits is not held', async function () {
                    useLongRetryDelay();
                    const id = await startWaitingOn503();
                    expect(pinned()).to.equal(1);

                    conversation.get().controller.removeMessage.direct(id);

                    expect(pinned()).to.equal(0);
                });

                it('a soft conversation delete during a waiting retry clears the hint and lets go', async function () {
                    useLongRetryDelay();
                    const id = await startWaitingOn503();
                    expect(pinned()).to.equal(1);

                    // Messages stay (their lifetimes stay active); only the send intent is gone.
                    conversation.get().controller.update.direct({lastUpdate: undefined});
                    for (let attempt = 0; attempt < 100 && pinned() > 0; attempt++) {
                        await sleep(2);
                    }

                    expect(pinned()).to.equal(0);
                    expect(issueOf(id), 'no retry is coming, so no waiting hint').to.equal(
                        undefined,
                    );
                });

                it('stopping the lane (quit) during a waiting retry clears the hint and lets go', async function () {
                    useLongRetryDelay();
                    const id = await startWaitingOn503();
                    expect(pinned()).to.equal(1);

                    stopOutgoingUploads(services.blob, 'quit');
                    for (let attempt = 0; attempt < 100 && pinned() > 0; attempt++) {
                        await sleep(2);
                    }

                    expect(pinned()).to.equal(0);
                    expect(issueOf(id)).to.equal(undefined);
                    expect(
                        db().hasOutgoingMessageOutboxEntry(id),
                        'resumes on next launch',
                    ).to.equal(true);
                });

                it('stopping the lane does not touch a terminal failure that is shown', async function () {
                    const id = await failTerminally();

                    stopOutgoingUploads(services.blob, 'quit');
                    await sleep(10);

                    expect(pinned()).to.equal(1);
                    expect(issueOf(id)).to.deep.equal({kind: 'failed', reason: 'too-large'});
                });

                function useLongRetryDelay(): void {
                    lane().retryTiming = {backoffMs: () => 60_000, budgetMs: 1_000_000};
                }

                async function startWaitingOn503(): Promise<MessageId> {
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);
                    rejectAllPending(refusal(503, 'server busy'));
                    for (let attempt = 0; attempt < 100 && issueOf(id) === undefined; attempt++) {
                        await sleep(2);
                    }
                    expect(issueOf(id)).to.deep.equal({kind: 'waiting'});
                    return id;
                }
            });

            it('the viewmodel status carries the reason for the user interface', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);
                rejectAllPending(refusal(413, 'blob too large'));
                await lane().drain(1000);

                const message = conversation.get().controller.getMessage(id);
                assert(message !== undefined && message.type !== MessageType.DELETED);
                const status = getMessageStatusData(message.get());

                expect(status.uploadIssue).to.deep.equal({kind: 'failed', reason: 'too-large'});
                expect(status.error?.at).to.be.instanceOf(Date);
            });

            it('a blob that fails for good aborts its sibling', async function () {
                useFastRetries();
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);
                const [main, thumbnail] = uploads;
                assert(main !== undefined && thumbnail !== undefined);

                main.reject(refusal(413, 'blob too large'));
                await lane().drain(1000);

                expect(thumbnail.signal?.aborted, 'the thumbnail upload was cancelled').to.equal(
                    true,
                );
                expect(
                    issueOf(id),
                    'and the reason is the real failure, not the cancel',
                ).to.deep.equal({kind: 'failed', reason: 'too-large'});
            });

            it('a failure that is not a server refusal (e.g. unreadable local file) ends the send', async function () {
                useFastRetries();
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                rejectAllPending(new Error('disk on fire'));
                await lane().drain(1000);

                expect(issueOf(id)).to.deep.equal({kind: 'failed', reason: 'failed'});
                expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
            });

            it('gives up with the generic failure once the retry budget is spent', async function () {
                // Every retry schedules 5 ms of backoff; the budget is 12 ms: 5, 10, then 15 is too much.
                useFastRetries({budgetMs: 12});
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());

                let attempts = 0;
                while (sendFailedAtOf(id) === undefined && attempts < 10) {
                    attempts += 1;
                    await untilNewUploads(2);
                    rejectAllPending(refusal(503, 'server busy'));
                    await sleep(30);
                }

                expect(attempts, 'tried a few times, then stopped').to.equal(3);
                expect(issueOf(id)).to.deep.equal({kind: 'failed', reason: 'failed'});
                expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
                expect(scheduledMessageIds()).to.deep.equal([]);
            });

            describe('the retry budget', function () {
                function offline(): BlobBackendError {
                    return new BlobBackendError('fetch', 'Fetch upload request errored');
                }
                function answered503(): BlobBackendError {
                    return refusal(503, 'server busy');
                }

                /** Fails every attempt with the given error kinds in order, then lets the next succeed. */
                async function failAttempts(
                    id: MessageId,
                    errors: readonly (() => Error)[],
                ): Promise<void> {
                    for (const makeError of errors) {
                        if (sendFailedAtOf(id) !== undefined) {
                            return;
                        }
                        await untilNewUploads(2);
                        rejectAllPending(makeError());
                        await sleep(25);
                    }
                }

                it('a message composed offline keeps waiting far beyond the budget and is then sent', async function () {
                    // 25 offline attempts schedule 125 ms of backoff against a 12 ms budget.
                    useFastRetries({budgetMs: 12});
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());

                    await failAttempts(id, new Array<() => Error>(25).fill(offline));
                    expect(sendFailedAtOf(id), 'still waiting, not failed').to.equal(undefined);
                    expect(db().hasOutgoingMessageOutboxEntry(id), 'outbox row kept').to.equal(
                        true,
                    );
                    expect(issueOf(id)).to.deep.equal({kind: 'waiting'});

                    await untilNewUploads(2);
                    for (const upload of uploads) {
                        upload.resolve();
                    }
                    expect(await lane().drain(1000)).to.equal(0);
                    expect(scheduledMessageIds()).to.deep.equal([id]);
                });

                it('a clock jump (laptop suspend) does not spend the budget', async function () {
                    useFastRetries();
                    const realNow = Date.now();
                    let jumps = 0;
                    stub(Date, 'now').callsFake(() => realNow + 3 * 60 * 60 * 1000 * jumps++);
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());

                    await failAttempts(id, [answered503, answered503, offline, answered503]);
                    expect(sendFailedAtOf(id), 'hours of jumped time are not charged').to.equal(
                        undefined,
                    );

                    await untilNewUploads(2);
                    for (const upload of uploads) {
                        upload.resolve();
                    }
                    expect(await lane().drain(1000)).to.equal(0);
                    expect(scheduledMessageIds()).to.deep.equal([id]);
                });

                it('repeated answered refusals still exhaust the budget', async function () {
                    useFastRetries({budgetMs: 12});
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());

                    await failAttempts(id, new Array<() => Error>(6).fill(answered503));

                    expect(issueOf(id)).to.deep.equal({kind: 'failed', reason: 'failed'});
                    expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
                });

                it('answered refusals without a status (bad blob id, refused token) are budgeted', async function () {
                    useFastRetries({budgetMs: 12});
                    const badId = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, badId, log());
                    await failAttempts(
                        badId,
                        new Array<() => Error>(6).fill(
                            () =>
                                new BlobBackendError('invalid-blob-id', 'bad id', {
                                    responded: true,
                                }),
                        ),
                    );
                    expect(issueOf(badId)).to.deep.equal({kind: 'failed', reason: 'failed'});

                    const refusedToken = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, refusedToken, log());
                    await failAttempts(
                        refusedToken,
                        new Array<() => Error>(6).fill(
                            () => new BlobBackendError('fetch', 'token', {responded: true}),
                        ),
                    );
                    expect(issueOf(refusedToken)).to.deep.equal({kind: 'failed', reason: 'failed'});
                });

                it('transport failures neither charge nor reset the accumulated charge', async function () {
                    useFastRetries({budgetMs: 12});
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());

                    // 5 ms charged, 5 offline (free), 10 ms charged, offline, then 15 ms > 12 ms.
                    await failAttempts(id, [
                        answered503,
                        offline,
                        offline,
                        offline,
                        offline,
                        offline,
                        answered503,
                        offline,
                    ]);
                    expect(sendFailedAtOf(id), 'two charged retries so far').to.equal(undefined);
                    await failAttempts(id, [answered503]);

                    expect(issueOf(id), 'the third answered refusal exhausts it').to.deep.equal({
                        kind: 'failed',
                        reason: 'failed',
                    });
                });

                for (const [mainIsOffline, label] of [
                    [true, 'main offline, thumbnail answered 503'],
                    [false, 'main answered 503, thumbnail offline'],
                ] as const) {
                    // The shared fixtures are only reassigned in `beforeEach`, never while a loop's tests run.
                    // eslint-disable-next-line @typescript-eslint/no-loop-func
                    it(`mixed blob failures keep the budget evidence (${label})`, async function () {
                        useFastRetries({budgetMs: 12});
                        const id = await addUnuploadedFileMessage();
                        dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());

                        for (
                            let round = 0;
                            round < 6 && sendFailedAtOf(id) === undefined;
                            round++
                        ) {
                            await untilNewUploads(2);
                            const [main, thumbnail] = uploads.splice(0);
                            assert(main !== undefined && thumbnail !== undefined);
                            main.reject(mainIsOffline ? offline() : answered503());
                            thumbnail.reject(mainIsOffline ? answered503() : offline());
                            await sleep(25);
                        }

                        expect(
                            issueOf(id),
                            'the answered refusal is charged, not hidden',
                        ).to.deep.equal({
                            kind: 'failed',
                            reason: 'failed',
                        });
                    });
                }
            });

            it('holds the head of the conversation while retrying, so the order is kept', async function () {
                useFastRetries();
                const fileId = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, fileId, log());
                await untilUploadsStarted(2);
                const textId = await sendText('behind the retrying file');

                rejectAllPending(refusal(503, 'server busy'));
                await untilNewUploads(2);
                expect(
                    scheduledMessageIds(),
                    'the text waits while the file retries',
                ).to.deep.equal([]);

                for (const upload of uploads) {
                    upload.resolve();
                }
                expect(await lane().drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([fileId, textId]);
            });

            it('a terminal failure releases the chain: the next message is sent', async function () {
                useFastRetries();
                const fileId = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, fileId, log());
                await untilUploadsStarted(2);
                const textId = await sendText('behind the failure');

                rejectAllPending(refusal(413, 'blob too large'));
                expect(await lane().drain(1000)).to.equal(0);

                expect(scheduledMessageIds()).to.deep.equal([textId]);
            });

            describe('while waiting to retry', function () {
                // Long delay: the tests end the wait by cancelling, never by letting it elapse.
                function useLongRetryDelay(): void {
                    lane().retryTiming = {
                        backoffMs: () => 60_000,
                        budgetMs: 1_000_000,
                    };
                }

                async function startWaiting(): Promise<MessageId> {
                    useLongRetryDelay();
                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);
                    rejectAllPending(refusal(503, 'server busy'));
                    for (let attempt = 0; attempt < 100 && issueOf(id) === undefined; attempt++) {
                        await sleep(2);
                    }
                    expect(issueOf(id)).to.deep.equal({kind: 'waiting'});
                    return id;
                }

                it('does not count as pending work, so a graceful quit does not wait for it', async function () {
                    await startWaiting();

                    expect(lane().pendingCount).to.equal(0);
                    expect(await lane().drain(10)).to.equal(0);
                });

                it('removing the message ends the wait and clears the outbox row', async function () {
                    const id = await startWaiting();

                    conversation.get().controller.removeMessage.direct(id);
                    for (
                        let attempt = 0;
                        attempt < 100 && db().hasOutgoingMessageOutboxEntry(id);
                        attempt++
                    ) {
                        await sleep(2);
                    }

                    expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
                    expect(uploads, 'no further attempt').to.have.length(0);
                    expect(scheduledMessageIds()).to.deep.equal([]);
                });

                it('invalidating the send intent of the conversation ends the wait', async function () {
                    const id = await startWaiting();

                    conversation.get().controller.update.direct({lastUpdate: undefined});
                    await sleep(20);

                    expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
                    expect(uploads).to.have.length(0);
                    expect(scheduledMessageIds()).to.deep.equal([]);
                });

                it('a quit ends the wait and keeps the outbox row for the next launch', async function () {
                    const id = await startWaiting();

                    lane().shutdown();
                    getBlobUploadCoordinator(services.blob).abortAll('quit');
                    await sleep(20);

                    expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(true);
                    expect(sendFailedAtOf(id)).to.equal(undefined);
                    expect(uploads).to.have.length(0);
                    expect(scheduledMessageIds()).to.deep.equal([]);
                });
            });

            describe('no upload error ever reaches the task manager', function () {
                const ERRORS: readonly [string, () => Error][] = [
                    ['413', () => refusal(413, 'blob too large')],
                    ['507', () => refusal(507, 'storage full')],
                    ['408 too slow', () => refusal(408, 'upload too slow')],
                    ['a local failure', () => new Error('cannot read file')],
                ];

                for (const [name, makeError] of ERRORS) {
                    // The shared fixtures are only reassigned in `beforeEach`, never while a loop's tests run.
                    // eslint-disable-next-line @typescript-eslint/no-loop-func
                    it(`${name}: nothing is scheduled, nothing is logged as unexpected, the queue stays empty`, async function () {
                        // The real task manager this time: connected, so anything scheduled would queue.
                        scheduleStub.restore();
                        const connected = services.taskManager.replace(ConnectionState.CONNECTING);
                        assert(connected !== undefined);
                        const errors: unknown[][] = [];
                        const watchedLog = {
                            ...log(),
                            error: (...args: unknown[]) => errors.push(args),
                        } as unknown as ReturnType<typeof log>;

                        const id = await addUnuploadedFileMessage();
                        dispatchOutgoingMessage(modelServices(), conversation.ctx, id, watchedLog);
                        await untilUploadsStarted(2);
                        rejectAllPending(makeError());
                        expect(await lane().drain(1000)).to.equal(0);

                        expect(errors, 'the lane job did not blow up').to.deep.equal([]);
                        expect(
                            await connected.flushPendingOutgoing(0),
                            'no task was queued',
                        ).to.equal(0);
                    });
                }

                it('a retried failure also never queues a task while it is retried', async function () {
                    scheduleStub.restore();
                    const connected = services.taskManager.replace(ConnectionState.CONNECTING);
                    assert(connected !== undefined);
                    useFastRetries();

                    const id = await addUnuploadedFileMessage();
                    dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                    await untilUploadsStarted(2);
                    rejectAllPending(refusal(503, 'server busy'));
                    await untilNewUploads(2);

                    expect(await connected.flushPendingOutgoing(0)).to.equal(0);
                    lane().shutdown();
                    getBlobUploadCoordinator(services.blob).abortAll('quit');
                });
            });
        });

        describe('cancellation', function () {
            it('removing the message during the upload aborts it, schedules nothing and clears the row', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                conversation.get().controller.removeMessage.direct(id);

                expect(uploads.map((upload) => upload.signal?.aborted)).to.deep.equal([true, true]);
                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([]);
                expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
            });

            it('removing all messages of the conversation (clear chat) aborts the upload', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                conversation.get().controller.removeAllMessages.direct();

                expect(uploads.map((upload) => upload.signal?.aborted)).to.deep.equal([true, true]);
                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([]);
            });

            it('invalidating the send intent of a conversation whose messages stay aborts the upload', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                // The soft delete of a conversation keeps its messages but drops every outbox row.
                conversation.get().controller.update.direct({lastUpdate: undefined});

                expect(uploads.map((upload) => upload.signal?.aborted)).to.deep.equal([true, true]);
                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([]);
                expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(false);
            });

            it('a cancel of another conversation does not touch this upload', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                getBlobUploadCoordinator(services.blob).abortConversation(
                    (conversation.ctx + 1n) as DbConversationUid,
                    'send-cancelled',
                );

                expect(uploads.every((upload) => upload.signal?.aborted === false)).to.equal(true);
                for (const upload of uploads) {
                    upload.resolve();
                }
                await getOutgoingPreparationLane(services.blob).drain(1000);
            });

            it('a quit abort leaves the row for the next launch and schedules nothing', async function () {
                const id = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await untilUploadsStarted(2);

                getBlobUploadCoordinator(services.blob).abortAll('quit');

                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([]);
                expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(true);
            });

            it('after shutdown nothing new starts and the outbox row is kept', async function () {
                const id = await addUnuploadedFileMessage();
                getOutgoingPreparationLane(services.blob).shutdown();

                dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
                await sleep(10);

                expect(uploads).to.have.length(0);
                expect(scheduledMessageIds()).to.deep.equal([]);
                expect(db().hasOutgoingMessageOutboxEntry(id)).to.equal(true);
            });
        });

        describe('waiting for an upload slot', function () {
            const LARGE_DECLARED = LARGE_UPLOAD_BYTES + 1;

            function otherConversation(): ModelStore<Conversation> {
                const other = addTestUserAsContact(services.model, makeTestUser('USER0002'));
                return other.get().controller.conversation();
            }

            it('a message deleted while it waits for a slot leaves the queue at once, so later sends of its conversation go out', async function () {
                const convB = otherConversation();
                // A large upload in conversation A holds the only large slot.
                const largeA = await addUnuploadedFileMessage(conversation, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), conversation.ctx, largeA, log());
                await untilUploadsStarted(2);
                // A large file in conversation B has to wait for that slot; a text queues behind it.
                const largeB = await addUnuploadedFileMessage(convB, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), convB.ctx, largeB, log());
                const textB = await sendText('behind the waiting file', convB);
                await sleep(10);
                expect(uploads, 'B waits for a slot, it did not start').to.have.length(2);
                expect(scheduledMessageIds()).to.deep.equal([]);

                convB.get().controller.removeMessage.direct(largeB);

                for (
                    let attempt = 0;
                    attempt < 100 && scheduledMessageIds().length === 0;
                    attempt++
                ) {
                    await sleep(2);
                }
                expect(
                    scheduledMessageIds(),
                    'the text goes out although A still holds the slot',
                ).to.deep.equal([textB]);
                expect(uploads, 'A is untouched').to.have.length(2);
                expect(uploads.every((upload) => upload.signal?.aborted === false)).to.equal(true);
                expect(db().hasOutgoingMessageOutboxEntry(largeB)).to.equal(false);

                for (const upload of uploads) {
                    upload.resolve();
                }
                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([textB, largeA]);
            });

            it('cancelling the send intent of the conversation frees the waiter too', async function () {
                const convB = otherConversation();
                const largeA = await addUnuploadedFileMessage(conversation, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), conversation.ctx, largeA, log());
                await untilUploadsStarted(2);
                const largeB = await addUnuploadedFileMessage(convB, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), convB.ctx, largeB, log());
                await sleep(10);

                convB.get().controller.update.direct({lastUpdate: undefined});
                await sleep(20);

                expect(
                    getOutgoingPreparationLane(services.blob).pendingCount,
                    'only A is left',
                ).to.equal(1);
                for (const upload of uploads) {
                    upload.resolve();
                }
                await getOutgoingPreparationLane(services.blob).drain(1000);
                expect(uploads, 'B never uploaded').to.have.length(2);
            });

            it('a slot that is freed later is not handed to the cancelled waiter', async function () {
                const convB = otherConversation();
                const largeA = await addUnuploadedFileMessage(conversation, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), conversation.ctx, largeA, log());
                await untilUploadsStarted(2);
                const largeB = await addUnuploadedFileMessage(convB, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), convB.ctx, largeB, log());
                await sleep(10);
                convB.get().controller.removeMessage.direct(largeB);
                await sleep(10);

                for (const upload of uploads) {
                    upload.resolve();
                }
                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                await sleep(10);

                expect(uploads, 'the removed message never started an upload').to.have.length(2);
                // And the slot is really free again: a new large upload can start.
                const next = await addUnuploadedFileMessage(conversation, LARGE_DECLARED);
                dispatchOutgoingMessage(modelServices(), conversation.ctx, next, log());
                await untilUploadsStarted(4);
            });
        });

        describe('stopping for teardown', function () {
            it('queued jobs start no fresh upload after the lane was stopped', async function () {
                const first = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, first, log());
                await untilUploadsStarted(2);
                const second = await addUnuploadedFileMessage();
                dispatchOutgoingMessage(modelServices(), conversation.ctx, second, log());
                const third = await sendText('queued as well');

                stopOutgoingUploads(services.blob, 'teardown');

                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                await sleep(10);
                expect(
                    uploads,
                    'the running upload was aborted, no new one started',
                ).to.have.length(2);
                expect(uploads.every((upload) => upload.signal?.aborted === true)).to.equal(true);
                expect(scheduledMessageIds()).to.deep.equal([]);
                for (const id of [first, second, third]) {
                    expect(
                        db().hasOutgoingMessageOutboxEntry(id),
                        'resumes on next launch',
                    ).to.equal(true);
                }
            });
        });

        describe('startup recovery', function () {
            it('goes through the lane: the upload runs first, the task is scheduled after it', async function () {
                const id = await addUnuploadedFileMessage();

                const result = recoverOutgoingMessageOutbox(modelServices(), log());
                expect(result.recovered).to.equal(1);
                await untilUploadsStarted(2);
                expect(scheduledMessageIds()).to.deep.equal([]);

                for (const upload of uploads) {
                    upload.resolve();
                }
                expect(await getOutgoingPreparationLane(services.blob).drain(1000)).to.equal(0);
                expect(scheduledMessageIds()).to.deep.equal([id]);
            });
        });

        it('an already uploaded message is scheduled without any upload', async function () {
            const id = randomMessageId(services.crypto);
            createFileMessage(db(), {
                id,
                conversationUid: conversation.ctx,
                mediaType: 'application/pdf',
                fileName: 'done.pdf',
                fileSize: 64,
            });
            enrollOutgoingMessageInOutbox(modelServices(), {
                messageId: id,
                conversationUid: conversation.ctx,
            });
            const message = conversation.get().controller.getMessage(id);
            assert(
                message !== undefined &&
                    message.ctx === MessageDirection.OUTBOUND &&
                    message.type === MessageType.FILE,
            );

            dispatchOutgoingMessage(modelServices(), conversation.ctx, id, log());
            await getOutgoingPreparationLane(services.blob).drain(1000);

            expect(uploads).to.have.length(0);
            expect(scheduledMessageIds()).to.deep.equal([id]);
        });
    });
}

export function run(): void {
    describe('model::outgoing-message-dispatch', function () {
        runLaneTests();
        runDispatchTests();
    });
}
