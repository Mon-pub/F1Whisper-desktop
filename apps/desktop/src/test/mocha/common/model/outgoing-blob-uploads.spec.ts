import {expect} from 'chai';

import type {DatabaseBackend, DbFileData, DbMessageUid} from '~/common/db';
import {MessageDirection, MessageType} from '~/common/enum';
import type {Contact, Conversation} from '~/common/model';
import {enrollOutgoingMessageInOutbox} from '~/common/model/outgoing-message-outbox';
import type {ServicesForModel} from '~/common/model/types/common';
import type {IOutboundFileMessageModelStore} from '~/common/model/types/message/file';
import type {ModelStore} from '~/common/model/utils/model-store';
import {
    BlobBackendError,
    type BlobId,
    type BlobUploadOptions,
    ensureBlobId,
} from '~/common/network/protocol/blob';
import {
    BlobUploadCancelledError,
    getBlobUploadCoordinator,
} from '~/common/network/protocol/f1-blob-upload-coordinator';
import type {ActiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingConversationMessageTask} from '~/common/network/protocol/task/csp/outgoing-conversation-message';
import {randomMessageId} from '~/common/network/protocol/utils';
import type {MessageId} from '~/common/network/types';
import {assert} from '~/common/utils/assert';
import {
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    TestHandle,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {createFileMessage} from '~/test/mocha/common/db-backend-tests';

async function sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * One pending `blob.upload` call, resolved or rejected by the test.
 */
interface PendingUpload {
    readonly size: number;
    readonly signal: AbortSignal | undefined;
    readonly resolve: () => BlobId;
    readonly reject: (error: Error) => void;
}

/**
 * Outgoing file message uploads (F1Whisper fork): single-flight per blob, per-blob checkpoint,
 * `syncing` reset on failure, and cancellation. Drives the real `uploadBlobs` and the real
 * `OutgoingConversationMessageTask` against a controllable blob backend.
 */
export function run(): void {
    describe('Outgoing blob uploads (F1Whisper fork)', function () {
        const me = makeTestUser('MEMEMEME');
        const anotherUser = makeTestUser('USER0001');

        let services: TestServices;
        let contact: ModelStore<Contact>;
        let conversation: ModelStore<Conversation>;
        let uploads: PendingUpload[];
        let uploadCount: number;
        let originalUpload: TestServices['blob']['upload'];

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            contact = addTestUserAsContact(services.model, anotherUser);
            conversation = contact.get().controller.conversation();
            uploads = [];
            uploadCount = 0;
            originalUpload = services.blob.upload.bind(services.blob);
            // A blob backend whose uploads stay pending until the test settles them.
            services.blob.upload = async (scope, data, options?: BlobUploadOptions) => {
                uploadCount += 1;
                return await new Promise<BlobId>((resolve, reject) => {
                    const blobId = ensureBlobId(new Uint8Array(16).fill(uploadCount));
                    uploads.push({
                        size: data.byteLength,
                        signal: options?.signal,
                        resolve: () => {
                            resolve(blobId);
                            return blobId;
                        },
                        reject,
                    });
                });
            };
        });

        this.afterEach(function () {
            services.blob.upload = originalUpload;
            getBlobUploadCoordinator(services.blob).abortAll('teardown');
        });

        function db(): DatabaseBackend {
            return services.model.db;
        }

        function recoveryServices(): ServicesForModel {
            return {...services, db: services.model.db} as unknown as ServicesForModel;
        }

        async function storedFileData(bytes: Uint8Array): Promise<DbFileData> {
            const handle = await services.file.store(bytes);
            return {
                fileId: handle.fileId,
                encryptionKey: handle.encryptionKey,
                unencryptedByteCount: bytes.byteLength,
                storageFormatVersion: handle.storageFormatVersion,
            };
        }

        /** An outbound file message with a main file and a thumbnail, neither uploaded yet. */
        async function addUnuploadedMessage(): Promise<{
            id: MessageId;
            uid: DbMessageUid;
            store: IOutboundFileMessageModelStore;
        }> {
            const id = randomMessageId(services.crypto);
            const uid = createFileMessage(db(), {
                id,
                conversationUid: conversation.ctx,
                mediaType: 'application/pdf',
                fileName: 'report.pdf',
                fileSize: 64,
                blobId: undefined,
                fileData: await storedFileData(new Uint8Array(64).fill(1)),
                thumbnailFileData: await storedFileData(new Uint8Array(16).fill(2)),
                thumbnailMediaType: 'image/jpeg',
            });
            const store = conversation.get().controller.getMessage(id);
            assert(
                store !== undefined &&
                    store.ctx === MessageDirection.OUTBOUND &&
                    store.type === MessageType.FILE,
                'an outbound file message should exist',
            );
            return {id, uid, store};
        }

        async function untilUploadsStarted(count: number): Promise<void> {
            for (let attempt = 0; attempt < 100 && uploads.length < count; attempt++) {
                await sleep(1);
            }
            expect(uploads).to.have.length(count);
        }

        function persisted(uid: DbMessageUid): {blobId?: BlobId; thumbnailBlobId?: BlobId} {
            const message = db().getMessageByUid(uid);
            assert(message !== undefined, 'message should be persisted');
            const row = message as {blobId?: BlobId; thumbnailBlobId?: BlobId};
            return {blobId: row.blobId, thumbnailBlobId: row.thumbnailBlobId};
        }

        function messageState(store: IOutboundFileMessageModelStore): string {
            return store.get().controller.lifetimeGuard.run((handle) => handle.view().state);
        }

        describe('uploadBlobs', function () {
            it('two concurrent calls (a re-run after a reconnect) start one request per blob', async function () {
                const {uid, store} = await addUnuploadedMessage();

                const first = store.get().controller.uploadBlobs();
                const second = store.get().controller.uploadBlobs();
                await untilUploadsStarted(2);
                // Give a (wrongly) duplicated upload every chance to show up.
                await sleep(20);
                expect(uploadCount, 'one POST per blob, not per caller').to.equal(2);

                for (const upload of uploads) {
                    upload.resolve();
                }
                const [firstBytes, secondBytes] = await Promise.all([first, second]);

                expect(firstBytes.main?.byteLength).to.equal(64);
                expect(secondBytes.main?.byteLength).to.equal(64);
                expect(persisted(uid).blobId).to.not.equal(undefined);
                expect(persisted(uid).thumbnailBlobId).to.not.equal(undefined);
                expect(messageState(store)).to.equal('synced');
                expect(getBlobUploadCoordinator(services.blob).inFlightCount).to.equal(0);
            });

            it('a failed thumbnail keeps the finished main blob; the retry uploads only the thumbnail', async function () {
                const {uid, store} = await addUnuploadedMessage();

                const attempt = store.get().controller.uploadBlobs();
                await untilUploadsStarted(2);
                const [main, thumbnail] = uploads;
                assert(main !== undefined && thumbnail !== undefined);
                const mainBlobId = main.resolve();
                thumbnail.reject(new BlobBackendError('fetch', 'thumbnail refused'));

                const error: unknown = await attempt.catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobBackendError);
                expect(persisted(uid).blobId, 'main blob id is checkpointed').to.deep.equal(
                    mainBlobId,
                );
                expect(persisted(uid).thumbnailBlobId).to.equal(undefined);
                expect(messageState(store), 'no longer syncing after a failure').to.equal(
                    'unsynced',
                );

                const retry = store.get().controller.uploadBlobs();
                await untilUploadsStarted(3);
                expect(
                    uploads[2]?.size,
                    'only the small thumbnail is uploaded again',
                ).to.be.lessThan(64);
                uploads[2]?.resolve();
                await retry;
                expect(uploadCount).to.equal(3);
                expect(persisted(uid).thumbnailBlobId).to.not.equal(undefined);
                expect(messageState(store)).to.equal('synced');
            });

            for (const [mainStatus, thumbnailStatus] of [
                [503, 507],
                [507, 503],
            ] as const) {
                for (const firstToFail of ['main', 'thumbnail'] as const) {
                    // eslint-disable-next-line @typescript-eslint/no-loop-func
                    it(`reports the terminal failure when main fails with ${mainStatus} and the thumbnail with ${thumbnailStatus} (${firstToFail} fails first)`, async function () {
                        const {store} = await addUnuploadedMessage();
                        const attempt = store.get().controller.uploadBlobs();
                        await untilUploadsStarted(2);
                        const [main, thumbnail] = uploads;
                        assert(main !== undefined && thumbnail !== undefined);
                        function refusal(status: number): BlobBackendError {
                            return new BlobBackendError('fetch', `status ${status}`, {status});
                        }
                        const byName = {
                            main: {upload: main, error: refusal(mainStatus)},
                            thumbnail: {upload: thumbnail, error: refusal(thumbnailStatus)},
                        };
                        const order =
                            firstToFail === 'main'
                                ? [byName.main, byName.thumbnail]
                                : [byName.thumbnail, byName.main];
                        for (const failure of order) {
                            failure.upload.reject(failure.error);
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 2);
                            });
                        }

                        const error: unknown = await attempt.catch((caught: unknown) => caught);
                        expect(error).to.be.instanceOf(BlobBackendError);
                        expect((error as BlobBackendError).status).to.equal(507);
                    });
                }
            }

            it('removing the message aborts the request and nothing is written afterwards', async function () {
                const {id, uid, store} = await addUnuploadedMessage();

                const attempt = store.get().controller.uploadBlobs();
                await untilUploadsStarted(2);

                conversation.get().controller.removeMessage.direct(id);

                expect(uploads.map((upload) => upload.signal?.aborted)).to.deep.equal([true, true]);
                // The transport ignores the abort and finishes anyway (late completion).
                for (const upload of uploads) {
                    upload.resolve();
                }
                const error: unknown = await attempt.catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobUploadCancelledError);
                expect((error as BlobUploadCancelledError).reason).to.equal('message-removed');
                expect(db().getMessageByUid(uid)).to.equal(undefined);
            });

            it('abortAll (quit) cancels with reason quit and keeps the message retryable', async function () {
                const {uid, store} = await addUnuploadedMessage();

                const attempt = store.get().controller.uploadBlobs();
                await untilUploadsStarted(2);
                getBlobUploadCoordinator(services.blob).abortAll('quit');

                const error: unknown = await attempt.catch((caught: unknown) => caught);
                expect(error).to.be.instanceOf(BlobUploadCancelledError);
                expect((error as BlobUploadCancelledError).reason).to.equal('quit');
                expect(persisted(uid).blobId).to.equal(undefined);
                expect(messageState(store)).to.equal('unsynced');

                // A later attempt (next launch / retry) uploads again.
                const retry = store.get().controller.uploadBlobs();
                await untilUploadsStarted(4);
                for (const upload of uploads.slice(2)) {
                    upload.resolve();
                }
                await retry;
                expect(persisted(uid).blobId).to.not.equal(undefined);
            });
        });

        describe('OutgoingConversationMessageTask', function () {
            it('no longer uploads: a file message that is not ready fails terminally instead of being dropped', async function () {
                const {id, store} = await addUnuploadedMessage();
                enrollOutgoingMessageInOutbox(recoveryServices(), {
                    messageId: id,
                    conversationUid: conversation.ctx,
                });
                const task = new OutgoingConversationMessageTask(
                    recoveryServices(),
                    conversation.ctx,
                    id,
                );

                const handle = new TestHandle(services, []);
                await task.run(handle as unknown as ActiveTaskCodecHandle<'persistent'>);
                handle.finish();

                expect(uploadCount, 'the task did not start an upload').to.equal(0);
                expect(store.get().view.sendFailedAt).to.be.instanceOf(Date);
                expect(
                    db().hasOutgoingMessageOutboxEntry(id),
                    'the send intent ends with the terminal failure',
                ).to.equal(false);
            });
        });
    });
}
