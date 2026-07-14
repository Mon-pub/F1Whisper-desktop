import {expect} from 'chai';

import {TweetNaClBackend} from '~/common/crypto/tweetnacl';
import {BlobDownloadState, MessageDirection, MessageDirectionUtils} from '~/common/enum';
import {randomFileEncryptionKey, randomFileId} from '~/common/file-storage';
import type {Contact, Conversation} from '~/common/model';
import type {FileMessageDataState} from '~/common/model/types/message';
import type {ModelStore} from '~/common/model/utils/model-store';
import {randomMessageId} from '~/common/network/protocol/utils';
import {FILE_STORAGE_FORMAT} from '~/common/node/file-storage/system-file-storage';
import {assert} from '~/common/utils/assert';
import {
    addTestUserAsContact,
    makeTestServices,
    makeTestUser,
    type TestServices,
} from '~/test/mocha/common/backend-mocks';
import {
    createAudioMessage,
    createFileMessage,
    randomBlobId,
    type TestFileMessageInit,
} from '~/test/mocha/common/db-backend-tests';
import {pseudoRandomBytes} from '~/test/mocha/common/utils';

const crypto = new TweetNaClBackend(pseudoRandomBytes);

export function run(): void {
    describe('Message model', function () {
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

        // Set up log for failed tests
        this.afterEach(function () {
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        describe('file message', function () {
            const testCases: {
                init: Pick<TestFileMessageInit, 'blobId' | 'fileData' | 'blobDownloadState'>;
                expectedState: FileMessageDataState;
            }[] = [
                // Test case 1: Unsynced because it doesn't contain file data
                {
                    init: {
                        blobId: randomBlobId(),
                        blobDownloadState: undefined,
                        fileData: undefined,
                    },
                    expectedState: 'unsynced',
                },
                // Test case 2: Unsynced because it doesn't contain blob ID
                {
                    init: {
                        blobId: undefined,
                        blobDownloadState: undefined,
                        fileData: {
                            fileId: randomFileId(crypto),
                            encryptionKey: randomFileEncryptionKey(crypto),
                            unencryptedByteCount: 123,
                            storageFormatVersion: FILE_STORAGE_FORMAT.V1,
                        },
                    },
                    expectedState: 'unsynced',
                },
                // Test case 3: Synced because it contains both blob ID and file data
                {
                    init: {
                        blobId: randomBlobId(),
                        blobDownloadState: undefined,
                        fileData: {
                            fileId: randomFileId(crypto),
                            encryptionKey: randomFileEncryptionKey(crypto),
                            unencryptedByteCount: 123,
                            storageFormatVersion: FILE_STORAGE_FORMAT.V1,
                        },
                    },
                    expectedState: 'synced',
                },
                // Test case 4: Failed if marked as failed
                {
                    init: {
                        blobId: randomBlobId(),
                        blobDownloadState: BlobDownloadState.PERMANENT_FAILURE,
                        fileData: undefined,
                    },
                    expectedState: 'failed',
                },
                // Test case 5: Failed if neither blob ID nor file data are set
                {
                    init: {
                        blobId: undefined,
                        blobDownloadState: undefined,
                        fileData: undefined,
                    },
                    expectedState: 'failed',
                },
            ];

            for (const testCase of testCases) {
                // eslint-disable-next-line @typescript-eslint/no-loop-func
                it(`initialize state '${testCase.expectedState}' for inbound ${testCase.expectedState} message`, function () {
                    // Create file message in database
                    const messageId = randomMessageId(crypto);
                    createFileMessage(services.model.db, {
                        // Message ID
                        id: messageId,
                        // Make it an inbound message
                        senderContactUid: contact.ctx,
                        conversationUid: conversation.ctx,
                        raw: new Uint8Array(123),
                        processedAt: new Date(),
                        // File data
                        mediaType: 'application/pdf',
                        fileName: 'document.pdf',
                        fileSize: 1234,
                        ...testCase.init,
                    });

                    // Fetch message model
                    const message = conversation.get().controller.getMessage(messageId);
                    assert(message !== undefined, 'Message not found');
                    assert(
                        message.type === 'file',
                        `Expected a file message, but found ${message.type}`,
                    );
                    assert(
                        message.ctx === MessageDirection.INBOUND,
                        `Expected INBOUND message direction, but it was ${MessageDirectionUtils.nameOf(
                            message.ctx,
                        )}`,
                    );

                    // Validate view fields
                    const view = message.get().view;
                    expect(view.fileName).to.equal('document.pdf');
                    expect(view.state).to.equal(testCase.expectedState);
                });
            }
        });

        describe('listen-once audio enforcement (F1Whisper fork)', function () {
            it('markListenOnceConsumed burns the message (sets flag, clears blob, blocks re-fetch)', async function () {
                const messageId = randomMessageId(crypto);
                createAudioMessage(services.model.db, {
                    id: messageId,
                    // Inbound listen-once voice with a downloaded local blob.
                    senderContactUid: contact.ctx,
                    conversationUid: conversation.ctx,
                    raw: new Uint8Array(123),
                    processedAt: new Date(),
                    mediaType: 'audio/aac',
                    fileName: 'voice.aac',
                    fileSize: 1234,
                    listenOnce: true,
                    listenOnceConsumed: false,
                    fileData: {
                        fileId: randomFileId(crypto),
                        encryptionKey: randomFileEncryptionKey(crypto),
                        unencryptedByteCount: 123,
                        storageFormatVersion: FILE_STORAGE_FORMAT.V1,
                    },
                });

                const message = conversation.get().controller.getMessage(messageId);
                assert(message !== undefined, 'Message not found');
                assert(message.type === 'audio', `Expected audio, found ${message.type}`);
                assert(message.ctx === MessageDirection.INBOUND, 'Expected inbound message');

                // Before consume: listen-once, not consumed, has local blob.
                expect(message.get().view.listenOnce).to.be.true;
                expect(message.get().view.listenOnceConsumed).to.not.equal(true);
                expect(message.get().view.fileData).to.not.be.undefined;

                // BURN on playback-complete.
                message.get().controller.markListenOnceConsumed();

                // After consume: consumed flag persisted (keyed off the persistent flag, NOT a
                // transient playback state), local blob cleared.
                expect(message.get().view.listenOnceConsumed, 'consumed flag set').to.be.true;
                expect(message.get().view.fileData, 'local blob cleared').to.be.undefined;

                // The flag persists in the DB and the local blob row is gone.
                const reloaded = services.model.db.getMessageByUid(message.get().controller.uid);
                assert(reloaded?.type === 'audio', 'Reloaded message must be audio');
                expect(reloaded.listenOnceConsumed, 'consumed flag persisted in DB').to.be.true;
                expect(reloaded.fileData, 'blob row cleared in DB').to.be.undefined;

                // Defense-in-depth backstop for save/share/forward: the blob can no longer be
                // re-fetched once consumed.
                let threw = false;
                try {
                    await message.get().controller.blob();
                } catch {
                    threw = true;
                }
                expect(threw, 'blob() rejects after consume').to.be.true;

                // Idempotent: a second consume is a harmless no-op.
                message.get().controller.markListenOnceConsumed();
                expect(message.get().view.listenOnceConsumed).to.be.true;
            });

            it('markListenOnceConsumed is a no-op for non-listen-once audio', function () {
                const messageId = randomMessageId(crypto);
                createAudioMessage(services.model.db, {
                    id: messageId,
                    senderContactUid: contact.ctx,
                    conversationUid: conversation.ctx,
                    raw: new Uint8Array(123),
                    processedAt: new Date(),
                    mediaType: 'audio/aac',
                    fileName: 'voice.aac',
                    fileSize: 1234,
                    listenOnce: false,
                    fileData: {
                        fileId: randomFileId(crypto),
                        encryptionKey: randomFileEncryptionKey(crypto),
                        unencryptedByteCount: 123,
                        storageFormatVersion: FILE_STORAGE_FORMAT.V1,
                    },
                });

                const message = conversation.get().controller.getMessage(messageId);
                assert(message !== undefined && message.type === 'audio');
                assert(message.ctx === MessageDirection.INBOUND);

                message.get().controller.markListenOnceConsumed();

                // Nothing burned: blob intact, not marked consumed.
                expect(message.get().view.listenOnceConsumed).to.not.equal(true);
                expect(message.get().view.fileData, 'blob not cleared for normal audio').to.not.be
                    .undefined;
            });
        });

        describe('message pinning (F1Whisper fork, local-only)', function () {
            it('setPinned persists and getPinnedMessageIds returns them oldest-pinned first', function () {
                const conversationController = conversation.get().controller;

                const id1 = randomMessageId(crypto);
                const id2 = randomMessageId(crypto);
                const id3 = randomMessageId(crypto);
                for (const [id, text] of [
                    [id1, 'one'],
                    [id2, 'two'],
                    [id3, 'three'],
                ] as const) {
                    createFileMessage(services.model.db, {
                        id,
                        senderContactUid: contact.ctx,
                        conversationUid: conversation.ctx,
                        raw: new Uint8Array(8),
                        processedAt: new Date(),
                        mediaType: 'text/plain',
                        fileName: `${text}.txt`,
                        fileSize: 8,
                    });
                }

                // Nothing pinned initially.
                expect(conversationController.getPinnedMessageIds()).to.be.empty;

                const m1 = conversationController.getMessage(id1);
                const m3 = conversationController.getMessage(id3);
                assert(m1 !== undefined && m3 !== undefined && m1.type !== 'deleted');
                assert(m3.type !== 'deleted');

                // Pin m3 (later), then m1 (earlier) → order must be [m1, m3] by pinnedAt ASC.
                m3.get().controller.setPinned(new Date(2000));
                m1.get().controller.setPinned(new Date(1000));

                // View reflects the pinned timestamp.
                expect(m1.get().view.pinnedAt?.getTime()).to.equal(1000);
                expect(m3.get().view.pinnedAt?.getTime()).to.equal(2000);

                expect(conversationController.getPinnedMessageIds()).to.deep.equal([id1, id3]);
                // The unpinned message m2 is excluded.
                expect(conversationController.getPinnedMessageIds()).to.not.include(id2);

                // Unpin m1 → only m3 remains; its view clears.
                m1.get().controller.setPinned(undefined);
                expect(m1.get().view.pinnedAt).to.be.undefined;
                expect(conversationController.getPinnedMessageIds()).to.deep.equal([id3]);

                // Unpin m3 → empty again.
                m3.get().controller.setPinned(undefined);
                expect(conversationController.getPinnedMessageIds()).to.be.empty;
            });

            it('pin/unpin emits a conversation-model update so the pinned banner refreshes', function () {
                const messageId = randomMessageId(crypto);
                createFileMessage(services.model.db, {
                    id: messageId,
                    senderContactUid: contact.ctx,
                    conversationUid: conversation.ctx,
                    raw: new Uint8Array(8),
                    processedAt: new Date(),
                    mediaType: 'text/plain',
                    fileName: 'pin.txt',
                    fileSize: 8,
                });
                const m = conversation.get().controller.getMessage(messageId);
                assert(m !== undefined && m.type !== 'deleted');

                // Subscribe to the conversation MODEL store (the same store the conversation
                // viewmodel derive subscribes to). The viewmodel re-queries getPinnedMessageIds()
                // on every emission, so an emission here == the banner refreshing.
                let emissions = 0;
                const unsubscribe = conversation.subscribe(() => {
                    emissions += 1;
                });
                // The initial subscribe fires synchronously; ignore that baseline.
                const baseline = emissions;

                m.get().controller.setPinned(new Date(1000));
                expect(emissions, 'pin triggered a conversation-model emission').to.be.greaterThan(
                    baseline,
                );

                const afterPin = emissions;
                m.get().controller.setPinned(undefined);
                expect(
                    emissions,
                    'unpin triggered a conversation-model emission',
                ).to.be.greaterThan(afterPin);

                unsubscribe();
            });
        });
    });
}
