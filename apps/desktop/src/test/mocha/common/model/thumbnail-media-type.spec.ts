import {expect} from 'chai';

import {TweetNaClBackend} from '~/common/crypto/tweetnacl';
import {randomFileEncryptionKey, randomFileId} from '~/common/file-storage';
import type {Contact, Conversation} from '~/common/model';
import {overwriteThumbnail} from '~/common/model/message/common';
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
import {createImageMessage, randomBlobId} from '~/test/mocha/common/db-backend-tests';
import {pseudoRandomBytes} from '~/test/mocha/common/utils';

const crypto = new TweetNaClBackend(pseudoRandomBytes);

/**
 * Regression test for the broken sender-side link-preview image: the desktop sends a link preview as
 * an image message that carries NO thumbnail on the wire, so the message has no `thumbnailMediaType`.
 * The outgoing task then locally regenerates a higher-res thumbnail via `regenerateThumbnail` ->
 * `overwriteThumbnail`, which stored the thumbnail BYTES but not the media type. Rendering asserts
 * "thumbnail media type should always be defined if medium has thumbnail bytes", so the sender's own
 * copy crashed/blanked while everyone else (who receives the thumbnail with its media type) saw it
 * fine. The fix makes `overwriteThumbnail` persist the media type alongside the bytes.
 */
export function run(): void {
    describe('thumbnail media type persistence (overwriteThumbnail)', function () {
        const me = makeTestUser('MEMEMEME');
        const other = makeTestUser('USER0001');

        let services: TestServices;
        let contact: ModelStore<Contact>;
        let conversation: ModelStore<Conversation>;

        this.beforeEach(function () {
            services = makeTestServices(me.identity.string);
            contact = addTestUserAsContact(services.model, other);
            conversation = contact.get().controller.conversation();
        });

        /** An image message that has the full image but NO thumbnail yet (the link-preview shape). */
        function createImageWithoutThumbnail() {
            const messageId = randomMessageId(crypto);
            createImageMessage(services.model.db, {
                id: messageId,
                senderContactUid: contact.ctx, // inbound; overwriteThumbnail is direction-agnostic
                conversationUid: conversation.ctx,
                raw: new Uint8Array(8),
                processedAt: new Date(),
                mediaType: 'image/jpeg',
                fileName: 'image.jpg',
                fileSize: 1234,
                blobId: randomBlobId(),
                blobDownloadState: undefined,
                fileData: {
                    fileId: randomFileId(crypto),
                    encryptionKey: randomFileEncryptionKey(crypto),
                    unencryptedByteCount: 1234,
                    storageFormatVersion: FILE_STORAGE_FORMAT.V1,
                },
                thumbnailFileData: undefined,
                thumbnailMediaType: undefined,
            });
            const message = conversation.get().controller.getMessage(messageId);
            assert(message !== undefined, 'image message should exist');
            return message.get().controller;
        }

        it('persists the thumbnail media type alongside the bytes', async function () {
            const controller = createImageWithoutThumbnail();
            // Sanity: no thumbnail media type initially.
            expect(
                controller.lifetimeGuard.run((handle) => handle.view().thumbnailMediaType),
            ).to.equal(undefined);

            await overwriteThumbnail(
                new Uint8Array([1, 2, 3, 4]),
                'image',
                controller.uid,
                conversation.ctx,
                {db: services.model.db, file: services.file},
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                controller.lifetimeGuard as any,
                services.logging.logger('test'),
                'image/png',
            );

            const view = controller.lifetimeGuard.run((handle) => handle.view());
            expect(view.thumbnailFileData, 'thumbnail bytes stored').to.not.equal(undefined);
            expect(
                view.thumbnailMediaType,
                'the thumbnail media type is persisted, so bytes never exist without a media type',
            ).to.equal('image/png');
        });

        it('without a media type, stored thumbnail bytes have none (the old broken state)', async function () {
            const controller = createImageWithoutThumbnail();
            await overwriteThumbnail(
                new Uint8Array([1, 2, 3, 4]),
                'image',
                controller.uid,
                conversation.ctx,
                {db: services.model.db, file: services.file},
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                controller.lifetimeGuard as any,
                services.logging.logger('test'),
                // No media type passed -> reproduces the crash condition (bytes without a media type).
            );
            const view = controller.lifetimeGuard.run((handle) => handle.view());
            expect(view.thumbnailFileData).to.not.equal(undefined);
            expect(view.thumbnailMediaType).to.equal(undefined);
        });
    });
}
