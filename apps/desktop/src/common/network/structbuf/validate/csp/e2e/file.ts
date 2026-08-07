import * as v from '@badrap/valita';

import {type BlobId, ensureBlobId} from '~/common/network/protocol/blob';
import * as csp from '~/common/network/structbuf/csp';
import {validator} from '~/common/network/structbuf/validate/utils';
import {type RawBlobKey, wrapRawBlobKey} from '~/common/network/types/keys';
import {ensureU53, type u53} from '~/common/types';
import {hexToBytes} from '~/common/utils/byte';
import {UTF8} from '~/common/utils/codec';
import {instanceOf} from '~/common/utils/valita-helpers';

// FU-M06: tolerant field validators. A present-but-malformed value (wrong type, or a non-finite /
// out-of-range number) maps to `undefined` instead of throwing and failing the parse of the WHOLE
// metadata object. This keeps every field INDEPENDENT: a malformed display field (e.g. a bad
// `w`/`h`/`d` dimension from a buggy or hostile peer) can never drop an unrelated privacy flag
// (`sp`/`lo`/`fwd`) or `qi` parsed from the same object. Absent fields stay absent (`.optional()`).
const OPTIONAL_TOLERANT_BOOLEAN = v
    .unknown()
    .map((value) => (typeof value === 'boolean' ? value : undefined))
    .optional();
const OPTIONAL_TOLERANT_FINITE_NUMBER = v
    .unknown()
    .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined))
    .optional();
const OPTIONAL_TOLERANT_U53 = v
    .unknown()
    .map((value) =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
            ? ensureU53(value)
            : undefined,
    )
    .optional();
const OPTIONAL_TOLERANT_STRING = v
    .unknown()
    .map((value) => (typeof value === 'string' ? value : undefined))
    .optional();

export const RAW_IMAGE_METADATA_SCHEMA = v
    .object({
        // The width as an integer in px
        w: OPTIONAL_TOLERANT_U53,
        // The height as an integer in px
        h: OPTIONAL_TOLERANT_U53,
        // Whether this is an animated picture (e.g. an AnimGIF)
        a: v
            .unknown()
            .map((value) => (typeof value === 'boolean' ? value : false))
            .optional(() => false),
        // Whether this media is a spoiler (F1Whisper Android fork; rendered blurred until tapped)
        sp: OPTIONAL_TOLERANT_BOOLEAN,
        // Whether this media was forwarded (F1Whisper Android fork; renders a "Forwarded" header)
        fwd: OPTIONAL_TOLERANT_BOOLEAN,
        // Link-preview URL/title/description (F1Whisper Android fork "MODEL A" sender-fetched
        // preview). These are protocol wire keys sent verbatim by the Android app, so the
        // snake_case names must be preserved exactly.
        /* eslint-disable @typescript-eslint/naming-convention */
        lp_u: OPTIONAL_TOLERANT_STRING,
        lp_t: OPTIONAL_TOLERANT_STRING,
        lp_d: OPTIONAL_TOLERANT_STRING,
        // Quoted message id, 16-hex-LE (F1Whisper fork "quote-any-type"; same wire key + encoding
        // Android uses). U-M03: accepted as `unknown` here (not `v.string()`) so a malformed `qi`
        // (wrong type, e.g. a peer sending a number or object) never fails validation of the WHOLE
        // metadata object. The 16-hex-LE string format is enforced independently when resolving it
        // into a MessageId in `getFileBasedMessageTypeAndExtraProperties`, which ignores (rather than
        // rejects) a malformed value.
        qi: v.unknown().optional(),
        /* eslint-enable @typescript-eslint/naming-convention */
    })
    .rest(v.unknown());

export const RAW_AUDIO_METADATA_SCHEMA = v
    .object({
        // The duration as float in seconds
        d: OPTIONAL_TOLERANT_FINITE_NUMBER,
        // Whether this is a listen-once voice message (F1Whisper Android fork; plays once then burns)
        lo: OPTIONAL_TOLERANT_BOOLEAN,
        // FU-M06: the peer-advertised local-consumption flag (`loc`) is intentionally NOT parsed
        // here. A received listen-once must be playable-once LOCALLY; a peer must never be able to
        // mark it already-consumed (which would render it burned before the recipient ever plays
        // it). It falls through to `.rest(v.unknown())` and is discarded. Mirrors the Android fork
        // v6.4.3-23 strip-`loc` lesson. `listenOnceConsumed` is a purely local flag flipped on
        // playback (see `getFileBasedMessageTypeAndExtraProperties`).
        // Quoted message id, 16-hex-LE (F1Whisper fork "quote-any-type"). See RAW_IMAGE_METADATA_SCHEMA
        // for why this is `unknown` rather than `string` (U-M03).
        qi: v.unknown().optional(),
    })
    .rest(v.unknown());

export const RAW_VIDEO_METADATA_SCHEMA = v
    .object({
        // The width as an integer in px
        w: OPTIONAL_TOLERANT_U53,
        // The height as an integer in px
        h: OPTIONAL_TOLERANT_U53,
        // The duration as float in seconds
        d: OPTIONAL_TOLERANT_FINITE_NUMBER,
        // Whether this media is a spoiler (F1Whisper Android fork; rendered blurred until tapped)
        sp: OPTIONAL_TOLERANT_BOOLEAN,
        // Whether this media was forwarded (F1Whisper Android fork; renders a "Forwarded" header)
        fwd: OPTIONAL_TOLERANT_BOOLEAN,
        // Quoted message id, 16-hex-LE (F1Whisper fork "quote-any-type"). See RAW_IMAGE_METADATA_SCHEMA
        // for why this is `unknown` rather than `string` (U-M03).
        qi: v.unknown().optional(),
    })
    .rest(v.unknown());

/**
 * Metadata for a generic (non-image/video/audio) file message. This is the only metadata field
 * generic file messages carry (F1Whisper fork "quote-any-type").
 */
export const RAW_FILE_METADATA_SCHEMA = v
    .object({
        // Quoted message id, 16-hex-LE (F1Whisper fork "quote-any-type"). See RAW_IMAGE_METADATA_SCHEMA
        // for why this is `unknown` rather than `string` (U-M03).
        qi: v.unknown().optional(),
    })
    .rest(v.unknown());

/**
 * The raw file JSON schema as defined by the protocol.
 */
export const RAW_FILE_JSON_SCHEMA = v
    .object({
        // Rendering type
        j: v
            .number()
            .map(ensureU53)
            .optional(() => 0),
        // Encryption key: Random symmetric key used to encrypt the blobs (file and thumbnail data)
        k: v.string().map(hexToBytes).map(wrapRawBlobKey),
        // File blob ID: Blob ID in lowercase hex string representation to obtain the file data
        b: v.string().map(hexToBytes).map(ensureBlobId),
        // File media type
        m: v.string(),
        // Optional file name
        n: v.string().optional(),
        // File size in bytes
        s: v.number().map(ensureU53),
        // Optional thumbnail blob ID: Blob containing the thumbnail file data
        t: v.string().map(hexToBytes).map(ensureBlobId).optional(),
        // Optional thumbnail media type
        p: v.string().optional(() => 'image/jpeg'),
        // Optional caption
        d: v.string().optional(),
        // Optional correlation ID: 32 byte ASCII string to collocate multiple media files
        c: v.string().optional(),
        // Optional metadata
        x: v.record().default({}),
    })
    .rest(v.unknown());

export type FileRenderingType = 'file' | 'media' | 'sticker';

/**
 * A validated and structured representation of the raw file JSON.
 */
export interface FileJson {
    readonly renderingType: FileRenderingType;
    readonly file: {
        readonly blobId: BlobId;
        readonly mediaType: string;
    };
    readonly thumbnail?: {
        readonly blobId: BlobId;
        readonly mediaType: string;
    };
    readonly encryptionKey: RawBlobKey;
    readonly fileName?: string;
    readonly fileSize: u53;
    readonly caption?: string;
    readonly correlationId?: string;
    readonly metadata?: Record<string, unknown>;
}

/**
 * Take a raw file JSON (with single-letter keys) and convert it into a more structured
 * {@link FileJson} object.
 */
function processRawFileJson(json: v.Infer<typeof RAW_FILE_JSON_SCHEMA>): FileJson {
    let renderingType: FileRenderingType;
    switch (json.j) {
        case 1:
            renderingType = 'media';
            break;
        case 2:
            renderingType = 'sticker';
            break;
        case 0:
        default:
            renderingType = 'file';
    }
    return {
        renderingType,
        file: {
            blobId: json.b,
            mediaType: json.m,
        },
        thumbnail:
            json.t === undefined
                ? undefined
                : {
                      blobId: json.t,
                      mediaType: json.p,
                  },
        encryptionKey: json.k,
        fileName: json.n,
        fileSize: json.s,
        caption: json.d,
        correlationId: json.c,
        metadata: json.x,
    };
}

/** Validates {@link csp.e2e.File} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.File.prototype, {
            file: instanceOf(Uint8Array)
                .map((value) => UTF8.decode(value))
                .map<unknown>((value) => JSON.parse(value))
                .map((json) => RAW_FILE_JSON_SCHEMA.parse(json))
                .map(processRawFileJson),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.File} */
export type Type = v.Infer<typeof SCHEMA>;
