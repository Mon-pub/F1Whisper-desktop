import {expect} from 'chai';

import {MessageType} from '~/common/enum';
import {NOOP_LOGGER} from '~/common/logging';
import {getFileBasedMessageTypeAndExtraProperties} from '~/common/network/protocol/task/common/file';
import {File} from '~/common/network/structbuf/validate/csp/e2e';
import {UTF8} from '~/common/utils/codec';

/**
 * Parse an Android-style raw file JSON into a {@link File.SCHEMA} `FileJson`, then run it through
 * {@link getFileBasedMessageTypeAndExtraProperties}.
 */
function decodeExtraProperties(
    json: Record<string, unknown>,
): ReturnType<typeof getFileBasedMessageTypeAndExtraProperties> {
    const fileData = File.SCHEMA.parse({file: UTF8.encode(JSON.stringify(json))}).file;
    return getFileBasedMessageTypeAndExtraProperties(fileData, NOOP_LOGGER);
}

// The metadata keys below (`lp_u`/`lp_t`/`lp_d`, plus arbitrary future keys) are protocol wire keys
// sent verbatim by the Android app, so their snake_case names are intentional in these fixtures.
/* eslint-disable @typescript-eslint/naming-convention */

const COMMON_FILE_FIELDS = {
    k: '0001020304050607000102030405060700010203040506070001020304050607',
    b: '00112233445566770011223344556677',
    s: 1234,
    // Media rendering type.
    j: 1,
};

/**
 * Tests for decoding F1Whisper fork media metadata (spoiler / forwarded / link-preview / listen-once)
 * out of an Android-sent file message.
 */
export function run(): void {
    describe('getFileBasedMessageTypeAndExtraProperties (fork metadata)', function () {
        it('decodes image spoiler + forwarded + link-preview metadata (URL present in caption)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                // The caption must contain the link-preview URL, otherwise the receive-side guard
                // suppresses the card (see the "injected" test below).
                d: 'check this out https://signal.org/page',
                x: {
                    w: 100,
                    h: 200,
                    sp: true,
                    fwd: true,
                    lp_u: 'https://signal.org/page',
                    lp_t: 'Example Title',
                    lp_d: 'Example description',
                },
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            // Narrowed: image branch carries the new typed fields.
            expect(props).to.include({
                spoiler: true,
                forwarded: true,
                linkPreviewUrl: 'https://signal.org/page',
                linkPreviewTitle: 'Example Title',
                linkPreviewDescription: 'Example description',
            });
        });

        it('suppresses an injected link-preview card whose URL is NOT in the caption', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                // Caption advertises a benign URL; the card claims a DIFFERENT one -> reject the card.
                d: 'look here https://signal.org/real',
                x: {
                    sp: true,
                    fwd: true,
                    lp_u: 'https://evil.example/phishing',
                    lp_t: 'Trust me',
                    lp_d: 'Totally safe',
                },
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            // The spoiler/forwarded affordances still apply; only the preview card is suppressed.
            expect(props).to.include({
                spoiler: true,
                forwarded: true,
                linkPreviewUrl: undefined,
                linkPreviewTitle: undefined,
                linkPreviewDescription: undefined,
            });
        });

        it('suppresses a link-preview card with no caption at all', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                x: {lp_u: 'https://signal.org/page', lp_t: 'Title'},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({linkPreviewUrl: undefined, linkPreviewTitle: undefined});
        });

        it('leaves image metadata undefined when the keys are absent', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                x: {w: 100, h: 200},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({
                spoiler: undefined,
                forwarded: undefined,
                linkPreviewUrl: undefined,
            });
        });

        it('decodes video spoiler + forwarded metadata', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'video/mp4',
                x: {d: 4.2, sp: true, fwd: false},
            });
            expect(props.type).to.equal(MessageType.VIDEO);
            expect(props).to.include({spoiler: true, forwarded: false});
        });

        it('decodes audio listen-once metadata', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'audio/aac',
                x: {d: 3.5, lo: true, loc: false},
            });
            expect(props.type).to.equal(MessageType.AUDIO);
            expect(props).to.include({listenOnce: true, listenOnceConsumed: false});
        });

        it('does not throw on unknown metadata values (tolerant rest)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                x: {sp: true, somethingFromAFutureClient: 'ignored'},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({spoiler: true});
        });
    });
}
