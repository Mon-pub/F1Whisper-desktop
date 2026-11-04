import {UTF8} from '@threema/ts-utils/codec/utf8';
import {hexLeToU64} from '@threema/ts-utils/number/hex-le-to-u64';
import {expect} from 'chai';

import {MessageType} from '~/common/enum';
import {NOOP_LOGGER} from '~/common/logging';
import {getFileBasedMessageTypeAndExtraProperties} from '~/common/network/protocol/task/common/file';
import {File} from '~/common/network/structbuf/validate/csp/e2e';
import {ensureMessageId} from '~/common/network/types';

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

        it('decodes audio listen-once metadata and IGNORES peer-supplied loc (FU-M06)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'audio/aac',
                // A peer must not be able to set our local "consumed" flag; `loc` is dropped on
                // receive (`listenOnceConsumed` is flipped only when WE play the message locally).
                x: {d: 3.5, lo: true, loc: false},
            });
            expect(props.type).to.equal(MessageType.AUDIO);
            expect(props).to.include({listenOnce: true, listenOnceConsumed: undefined});
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

    /**
     * Tests for decoding + resolving the F1Whisper fork "quote-any-type" metadata key `"qi"` (a
     * 16-hex-LE quoted apiMessageId, same encoding as the quotes-v2 text quote) across every
     * file-based message type.
     */
    describe('getFileBasedMessageTypeAndExtraProperties (quote-any-type "qi")', function () {
        const quotedHex = '0102030405060708';
        const quotedMessageId = ensureMessageId(hexLeToU64(quotedHex));

        it('decodes + resolves `qi` on an image message', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                x: {qi: quotedHex},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({quotedMessageId});
        });

        it('decodes + resolves `qi` on a video message', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'video/mp4',
                x: {qi: quotedHex},
            });
            expect(props.type).to.equal(MessageType.VIDEO);
            expect(props).to.include({quotedMessageId});
        });

        it('decodes + resolves `qi` on an audio message', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'audio/aac',
                x: {qi: quotedHex},
            });
            expect(props.type).to.equal(MessageType.AUDIO);
            expect(props).to.include({quotedMessageId});
        });

        it('decodes + resolves `qi` on a generic (non-media) file message', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'application/pdf',
                // Rendering type 0 (plain file), so this hits the generic FILE branch.
                j: 0,
                x: {qi: quotedHex},
            });
            expect(props.type).to.equal(MessageType.FILE);
            expect(props).to.include({quotedMessageId});
        });

        it('leaves quotedMessageId undefined when `qi` is absent', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                x: {sp: true},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({quotedMessageId: undefined});
        });

        it('ignores a malformed `qi` value instead of throwing or dropping other metadata', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                // Not a valid 16-hex-LE message id.
                x: {sp: true, qi: 'not-a-valid-hex-message-id'},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            // The rest of the metadata must survive; only the bad `qi` is dropped.
            expect(props).to.include({spoiler: true, quotedMessageId: undefined});
        });

        it('ignores a too-short `qi` value', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'video/mp4',
                x: {qi: '0102'},
            });
            expect(props.type).to.equal(MessageType.VIDEO);
            expect(props).to.include({quotedMessageId: undefined});
        });

        // U-M03 regression: a `qi` of the WRONG TYPE (not a string at all) used to fail validation of
        // the WHOLE metadata object at the outer schema (`qi: v.string().optional()` rejects a
        // present non-string value), discarding every other field parsed alongside it -- not just
        // `qi`. The outer schema now accepts `qi` as `unknown`; only the independent resolution step
        // ignores a non-string value. These cases would have thrown and returned bare defaults before
        // the fix.
        it('ignores a `qi` of the wrong type (number) without discarding spoiler/forwarded (U-M03)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                x: {sp: true, fwd: true, qi: 1234567890},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({spoiler: true, forwarded: true, quotedMessageId: undefined});
        });

        it('ignores a `qi` of the wrong type (object) without discarding listen-once (U-M03)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'audio/aac',
                x: {lo: true, qi: {evil: true}},
            });
            expect(props.type).to.equal(MessageType.AUDIO);
            expect(props).to.include({listenOnce: true, quotedMessageId: undefined});
        });

        it('ignores a `qi` of the wrong type (array) without discarding duration/forwarded (U-M03)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'video/mp4',
                x: {d: 4.2, fwd: true, qi: [1, 2, 3]},
            });
            expect(props.type).to.equal(MessageType.VIDEO);
            expect(props).to.include({duration: 4.2, forwarded: true, quotedMessageId: undefined});
        });

        it('ignores a `qi` of `null` on a generic file message (U-M03)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'application/pdf',
                j: 0,
                x: {qi: null},
            });
            expect(props.type).to.equal(MessageType.FILE);
            expect(props).to.include({quotedMessageId: undefined});
        });
    });

    /**
     * FU-M06 regression: the privacy-relevant flags (`sp`/`lo`/`fwd`/`qi`) must be parsed
     * INDEPENDENTLY of the optional display metadata (`w`/`h`/`d`), so a malformed display field
     * from a buggy/hostile peer can never drop a privacy flag; and a peer-supplied `loc` is ignored.
     * These cases would FAIL if the schema reverted to strict per-field validation (a malformed
     * dimension would throw and the catch would return bare defaults, dropping `sp`).
     */
    describe('getFileBasedMessageTypeAndExtraProperties (FU-M06 privacy-flag isolation)', function () {
        const quotedHex = '0102030405060708';
        const quotedMessageId = ensureMessageId(hexLeToU64(quotedHex));

        it('a malformed image dimension does NOT drop spoiler / forwarded / qi', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'image/jpeg',
                // `w` is a string and `h` is null: malformed display metadata.
                x: {w: 'not-a-number', h: null, sp: true, fwd: true, qi: quotedHex},
            });
            expect(props.type).to.equal(MessageType.IMAGE);
            expect(props).to.include({spoiler: true, forwarded: true, quotedMessageId});
            // The malformed dimensions are simply dropped; the flags survived intact.
            expect(props).to.have.property('dimensions', undefined);
        });

        it('a malformed video duration does NOT drop the spoiler flag', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'video/mp4',
                x: {d: 'nope', sp: true},
            });
            expect(props.type).to.equal(MessageType.VIDEO);
            expect(props).to.include({spoiler: true, duration: undefined});
        });

        it('a malformed listen-once flag does NOT drop the duration / qi', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'audio/aac',
                x: {d: 3.5, lo: 'yes', qi: quotedHex},
            });
            expect(props.type).to.equal(MessageType.AUDIO);
            expect(props).to.include({duration: 3.5, listenOnce: undefined, quotedMessageId});
        });

        it('a peer-supplied loc=true is IGNORED (a received listen-once stays playable)', function () {
            const props = decodeExtraProperties({
                ...COMMON_FILE_FIELDS,
                m: 'audio/aac',
                // A hostile peer tries to pre-burn our listen-once by advertising loc=true.
                x: {lo: true, loc: true},
            });
            expect(props.type).to.equal(MessageType.AUDIO);
            expect(props).to.include({listenOnce: true, listenOnceConsumed: undefined});
        });
    });
}
