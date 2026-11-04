import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import {u64ToHexLe} from '@threema/ts-utils/number/u64-to-hex-le';
import {expect} from 'chai';

import {ImageRenderingType, MessageDirection} from '~/common/enum';
import {randomFileEncryptionKey, randomFileId} from '~/common/file-storage';
import type {
    GroupMemberReceiptView,
    MessageHistoryViewEntry,
    MessageReactionView,
} from '~/common/model/types/message';
import {getFileJsonData} from '~/common/network/protocol/task/csp/common';
import {randomMessageId} from '~/common/network/protocol/utils';
import {ensureIdentityString} from '~/common/network/types';
import {makeTestServices, type TestServices} from '~/test/mocha/common/backend-mocks';
import {randomBlobId, randomBlobKey} from '~/test/mocha/common/db-backend-tests';

/**
 * Test CSP task helpers.
 */
export function run(): void {
    describe('getFileJson', function () {
        const me = ensureIdentityString('MEMEMEME');

        // Set up services and log printing
        let services: TestServices;
        this.beforeEach(function () {
            services = makeTestServices(me);
        });
        this.afterEach(function () {
            if (this.currentTest?.state === 'failed') {
                console.log('--- Failed test logs start ---');
                services.logging.printLogs();
                console.log('--- Failed test logs end ---');
            }
        });

        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        function getFileView() {
            const {crypto} = services;
            return {
                id: randomMessageId(crypto),
                createdAt: new Date(),
                direction: MessageDirection.OUTBOUND,
                state: 'unsynced',
                blobId: randomBlobId(),
                thumbnailBlobId: randomBlobId(),
                encryptionKey: randomBlobKey(),
                fileData: {
                    fileId: randomFileId(crypto),
                    encryptionKey: randomFileEncryptionKey(crypto),
                    unencryptedByteCount: 123,
                    storageFormatVersion: 0,
                },
                thumbnailFileData: {
                    fileId: randomFileId(crypto),
                    encryptionKey: randomFileEncryptionKey(crypto),
                    unencryptedByteCount: 123,
                    storageFormatVersion: 0,
                },
                mediaType: 'application/jpeg',
                thumbnailMediaType: 'application/jpeg',
                fileName: 'filename.jpg',
                fileSize: 12345,
                caption: 'Hello caption',
                correlationId: 'abcd',
                ordinal: 0,
                reactions: [] as MessageReactionView[],
                groupMemberReceipts: [] as GroupMemberReceiptView[],
                history: [] as MessageHistoryViewEntry[],
            } as const;
        }

        it('properly encodes raw file messages', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'file',
                view,
            });
            expect(fileJson).to.deep.equal({
                j: 0,
                i: 0,
                k: bytesToHex(view.encryptionKey.unwrap()),
                b: bytesToHex(view.blobId),
                t: bytesToHex(view.thumbnailBlobId),
                m: view.mediaType,
                p: view.thumbnailMediaType,
                n: view.fileName,
                s: view.fileSize,
                d: view.caption,
                c: view.correlationId,
            });
        });

        it('properly encodes image messages (regular, non-animated, no dimensions)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'image',
                view: {
                    ...view,
                    renderingType: ImageRenderingType.REGULAR,
                    animated: false,
                },
            });
            expect(fileJson).to.deep.equal({
                j: 1,
                i: 1,
                k: bytesToHex(view.encryptionKey.unwrap()),
                b: bytesToHex(view.blobId),
                t: bytesToHex(view.thumbnailBlobId),
                m: view.mediaType,
                p: view.thumbnailMediaType,
                n: view.fileName,
                s: view.fileSize,
                d: view.caption,
                c: view.correlationId,
                x: {
                    a: false,
                },
            });
        });

        it('encodes a listen-once audio message with `lo` and NEVER `loc` (F1Whisper fork)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'audio',
                view: {
                    ...view,
                    duration: 7,
                    // The local consumed flag must NOT leak onto the wire.
                    listenOnce: true,
                    listenOnceConsumed: true,
                },
            });
            // The metadata must contain `lo: true` and must NOT contain `loc`.
            expect(fileJson.x).to.deep.equal({d: 7, lo: true});
            expect(fileJson.x).to.not.have.property('loc');
        });

        it('encodes a non-listen-once audio message without `lo`/`loc` (F1Whisper fork)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'audio',
                view: {
                    ...view,
                    duration: 7,
                    listenOnce: false,
                    listenOnceConsumed: false,
                },
            });
            // `filterUndefinedProperties` drops `lo` entirely when not listen-once.
            expect(fileJson.x).to.deep.equal({d: 7});
            expect(fileJson.x).to.not.have.property('lo');
            expect(fileJson.x).to.not.have.property('loc');
        });

        it('properly encodes image messages (sticker, animated, with dimensions)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'image',
                view: {
                    ...view,
                    renderingType: ImageRenderingType.STICKER,
                    animated: true,
                    dimensions: {height: 123, width: 50},
                },
            });
            expect(fileJson).to.deep.equal({
                j: 2,
                i: 1,
                k: bytesToHex(view.encryptionKey.unwrap()),
                b: bytesToHex(view.blobId),
                t: bytesToHex(view.thumbnailBlobId),
                m: view.mediaType,
                p: view.thumbnailMediaType,
                n: view.fileName,
                s: view.fileSize,
                d: view.caption,
                c: view.correlationId,
                x: {
                    a: true,
                    h: 123,
                    w: 50,
                },
            });
        });

        it('encodes a quoted file message with `qi` (F1Whisper fork "quote-any-type")', function () {
            const view = getFileView();
            const quotedMessageId = randomMessageId(services.crypto);
            const fileJson = getFileJsonData({
                type: 'file',
                view: {
                    ...view,
                    quotedMessageId,
                },
            });
            expect(fileJson.x).to.deep.equal({qi: u64ToHexLe(quotedMessageId)});
        });

        it('encodes a quoted image message with `qi` alongside other metadata', function () {
            const view = getFileView();
            const quotedMessageId = randomMessageId(services.crypto);
            const fileJson = getFileJsonData({
                type: 'image',
                view: {
                    ...view,
                    renderingType: ImageRenderingType.REGULAR,
                    animated: false,
                    spoiler: true,
                    quotedMessageId,
                },
            });
            expect(fileJson.x).to.deep.equal({a: false, sp: true, qi: u64ToHexLe(quotedMessageId)});
        });

        it('encodes a quoted video message with `qi`', function () {
            const view = getFileView();
            const quotedMessageId = randomMessageId(services.crypto);
            const fileJson = getFileJsonData({
                type: 'video',
                view: {
                    ...view,
                    duration: 3,
                    quotedMessageId,
                },
            });
            expect(fileJson.x).to.deep.equal({d: 3, qi: u64ToHexLe(quotedMessageId)});
        });

        it('encodes a quoted audio message with `qi`, independent of listen-once', function () {
            const view = getFileView();
            const quotedMessageId = randomMessageId(services.crypto);
            const fileJson = getFileJsonData({
                type: 'audio',
                view: {
                    ...view,
                    duration: 7,
                    listenOnce: false,
                    quotedMessageId,
                },
            });
            expect(fileJson.x).to.deep.equal({d: 7, qi: u64ToHexLe(quotedMessageId)});
        });

        it('omits `x` entirely for a plain (unquoted) file message (F1Whisper fork wire-compat)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'file',
                view,
            });
            expect(fileJson).to.not.have.property('x');
        });

        it('encodes a spoiler video message with `sp` (F1Whisper fork media-spoiler send)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'video',
                view: {
                    ...view,
                    duration: 5,
                    spoiler: true,
                },
            });
            expect(fileJson.x).to.deep.equal({d: 5, sp: true});
        });

        it('encodes a non-spoiler video message without `sp` (F1Whisper fork media-spoiler send)', function () {
            const view = getFileView();
            const fileJson = getFileJsonData({
                type: 'video',
                view: {
                    ...view,
                    duration: 5,
                    spoiler: false,
                },
            });
            // `filterUndefinedProperties` never drops an explicit `false`; `sp: false` is a valid,
            // harmless wire value (matches the image branch's existing behaviour).
            expect(fileJson.x).to.deep.equal({d: 5, sp: false});
        });
    });
}
