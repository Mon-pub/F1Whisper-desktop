import * as v from '@badrap/valita';
import {CryptoError} from '@threema/crypto';
import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import {base64ToU8a} from '@threema/ts-utils/base64/base64-to-u8a';
import {u8aToBase64} from '@threema/ts-utils/base64/u8a-to-base64';
import {byteEquals} from '@threema/ts-utils/byte/byte-equals';
import {UTF8} from '@threema/ts-utils/codec/utf8';
import {ensureU53, type u53} from '@threema/ts-utils/integer/u53';

import type {ServicesForBackend} from '~/common/backend';
import {
    ensurePublicKey,
    ensureEd25519PublicKey,
    ensureEd25519Signature,
    type Ed25519PublicKey,
} from '~/common/crypto';
import {ensureBaseUrl, validateUrl} from '~/common/network/types';
import {ensureSpkiValue} from '~/common/types';
import {entriesReverse} from '~/common/utils/array';

const OPPF_SIGNATURE_KEY_SCHEMA = v
    .string()
    .map((value) => base64ToU8a(value))
    .map(ensureEd25519PublicKey);

const OPPF_FILE_ONLY_SIGNATURE_KEY_SCHEMA = v
    .object({
        signatureKey: OPPF_SIGNATURE_KEY_SCHEMA,
    })
    .rest(v.unknown());

const OPPF_UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/** Parse an OPPF calendar date without accepting JavaScript's permissive date normalization. */
function parseOppfUtcDate(value: string): Date {
    if (!OPPF_UTC_DATE_PATTERN.test(value)) {
        throw new Error(`Expected a UTC calendar date in YYYY-MM-DD form, got: ${value}`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error(`Invalid UTC calendar date: ${value}`);
    }
    return date;
}

// Note: Since many of the URLs contain variables that we need to replace at runtime, we only
// validate those but not transform them to `URL` or `BaseUrl` as transforming would escape the
// curly brackets used for the variables.
export const OPPF_FILE_SCHEMA = v
    .object({
        version: v.string(),
        signatureKey: OPPF_SIGNATURE_KEY_SCHEMA,
        refresh: v.number().map(ensureU53),
        license: v
            .object({
                id: v.string(),
                // OPPF dates are UTC calendar dates, not JavaScript's broad implementation-defined
                // date grammar. Enforce syntax and an exact UTC round trip so values such as
                // `2024-02-30`, timestamps, and locale-formatted dates fail closed.
                expires: v.string().chain((s) => {
                    try {
                        return v.ok(parseOppfUtcDate(s));
                    } catch {
                        return v.err(`license.expires is not a valid YYYY-MM-DD UTC date: ${s}`);
                    }
                }),
                count: v.number().map(ensureU53),
            })
            .rest(v.unknown()),
        chat: v
            .object({
                publicKey: v.string().map((pk) => ensurePublicKey(base64ToU8a(pk))),
            })
            .rest(v.unknown()),
        directory: v
            .object({
                url: v.string().map((url) => ensureBaseUrl(url, 'https:')),
            })
            .rest(v.unknown()),
        work: v
            .object({
                url: v.string().map((url) => {
                    ensureBaseUrl(url, 'https:');
                    return url;
                }),
            })
            .rest(v.unknown()),
        avatar: v
            .object({
                url: v.string().map((url) => {
                    ensureBaseUrl(url, 'https:');
                    return url;
                }),
            })
            .rest(v.unknown()),
        safe: v
            .object({
                url: v.string().map((url) => {
                    ensureBaseUrl(url, 'https:');
                    return url;
                }),
            })
            .rest(v.unknown()),
        mediator: v
            .object({
                url: v.string().map((url) => {
                    ensureBaseUrl(url, 'wss:');
                    return url;
                }),
                blob: v
                    .object({
                        uploadUrl: v.string().map((url) => {
                            validateUrl(url, {
                                protocol: 'https:',
                                search: 'deny',
                                hash: 'deny',
                            });
                            return url;
                        }),
                        downloadUrl: v.string().map((url) => {
                            validateUrl(url, {
                                protocol: 'https:',
                                search: 'deny',
                                hash: 'deny',
                            });
                            return url;
                        }),
                        doneUrl: v.string().map((url) => {
                            validateUrl(url, {
                                protocol: 'https:',
                                search: 'deny',
                                hash: 'deny',
                            });
                            return url;
                        }),
                    })
                    .rest(v.unknown()),
            })
            .rest(v.unknown()),
        rendezvous: v
            .object({
                url: v.string().map((url) => {
                    ensureBaseUrl(url, 'wss:');
                    return url;
                }),
            })
            .rest(v.unknown()),
        updates: v
            .object({
                desktop: v
                    .object({
                        autoUpdate: v.boolean(),
                    })
                    .rest(v.unknown())
                    .optional(),
            })
            .rest(v.unknown())
            .optional(),
        domains: v
            .object({
                rules: v.array(
                    v
                        .object({
                            spkis: v.array(
                                v
                                    .object({
                                        algorithm: v.literal('sha256'),
                                        value: v
                                            .string()
                                            .map((value) => base64ToU8a(value))
                                            .map(ensureSpkiValue),
                                    })
                                    .rest(v.unknown()),
                            ),
                            fqdn: v.string(),
                            matchMode: v.union(v.literal('include-subdomains'), v.literal('exact')),
                        })
                        .rest(v.unknown()),
                ),
            })
            .optional(),
    })
    .rest(v.unknown());

export type OppfFile = v.Infer<typeof OPPF_FILE_SCHEMA>;

// An Ed25519 signature has 64 bytes which Base64 encoded result in 88 bytes.
const ED25519_BASE64_ENCODED_SIGNATURE_LENGTH = 88;

/**
 * Decode and verify the UTF-8 encoded OPPF JSON body against the Base64 encoded Ed25519 signature
 * and the trusted public keys.
 *
 * @throws {@link Error} in case the provided data does not contain a valid OPPF file.
 * @throws {@link CryptoError} in case the signature does not match.
 * @returns the parsed OPPF JSON body and the OPPF string data.
 */
export function verifyOppfFile(
    services: Pick<ServicesForBackend, 'crypto'>,
    trustedKeys: readonly Ed25519PublicKey[],
    data: ReadonlyUint8Array,
): {readonly parsed: OppfFile; readonly string: string} {
    const offset = calculateOppfBodyOffset(data);
    const bytes = extractOppfBodyAndSignature(data, offset);

    // Decode the signature
    const signature = ensureEd25519Signature(base64ToU8a(UTF8.decode(bytes.signature)));

    // Decode the OPPF file but only validate the signature key for now
    const string = UTF8.decode(bytes.body);
    const decoded = JSON.parse(string) as unknown;
    const {signatureKey} = OPPF_FILE_ONLY_SIGNATURE_KEY_SCHEMA.parse(decoded);

    // Ensure the signature key matches against one of the hard-coded public keys we accept
    if (!trustedKeys.some((trusted) => byteEquals(signatureKey, trusted))) {
        throw new Error(
            `OPPF file is signed with an unknown signature key: ${u8aToBase64(signatureKey)} (Base64)`,
        );
    }

    // Validate the signature against the file body now
    services.crypto.verifyEd25519Signature(signatureKey, bytes.body, signature);

    // Now validate the rest of the file
    const parsed = OPPF_FILE_SCHEMA.parse(decoded);

    // Check whether the OPPF file expired
    if (new Date() > parsed.license.expires) {
        throw new Error(`OPPF file expired at ${parsed.license.expires}`);
    }

    // Now validate the rest of the file
    return {parsed, string};
}

/**
 * How long past its license expiry a cached OPPF may still be used while the OnPrem server cannot be
 * reached to refresh it. Bounds how long expired/revoked security-sensitive configuration can remain
 * active offline (P-H07 offline grace).
 */
export const OPPF_EXPIRED_OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Maximum time since the last successful server refresh (`lastUpdated`) that a valid-but-stale cached
 * OPPF may still be used while the OnPrem server is unreachable. Bounds how long a network-level block
 * of just the OnPrem host (no device compromise) can keep a stale cache -- and a revoked signer --
 * alive, mirroring {@link OPPF_EXPIRED_OFFLINE_GRACE_MS} but anchored to the last refresh rather than
 * to license expiry.
 */
export const OPPF_STALE_OFFLINE_MAX_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * How aged the staleness anchor (`lastUpdated`) may get before a successful background refresh
 * re-persists it. Keeps a byte-stable OPPF's anchor advancing (so it does not drift into the
 * synchronous-refresh branch) without paying an Argon2 keystore re-derivation on every rapid
 * relaunch. Must stay below {@link OPPF_MIN_STALENESS_MS} so the anchor is refreshed before it can go
 * stale.
 */
export const OPPF_ANCHOR_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** Lower clamp for the derived cache-staleness bound (see {@link decideCachedOppfUsage}). */
const OPPF_MIN_STALENESS_MS = 60 * 60 * 1000; // 1 hour
/** Upper clamp for the derived cache-staleness bound. */
const OPPF_MAX_STALENESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Temporal facts about a cached OPPF, in unix milliseconds where applicable.
 */
export interface CachedOppfTemporalInput {
    /** `license.expires` of the cached OPPF. */
    readonly expiresMs: u53;
    /** When the cache was last written (`lastUpdated`). */
    readonly lastUpdatedMs: u53;
    /** The OPPF's declared refresh cadence, in seconds (`refresh`). */
    readonly refreshSeconds: u53;
}

/**
 * The decision on how to treat a cached OPPF before use.
 */
export interface CachedOppfDecision {
    /**
     * - `skip`: the cache is valid and fresh; use it directly and refresh in the background.
     * - `preferred`: the cache is valid but stale; refresh synchronously if the server is reachable
     *   (so any rotation applies this session), otherwise keep using the still-valid cache.
     * - `required`: the cache is expired; refresh synchronously, and only fall back to the cache per
     *   {@link offlineFallback}.
     */
    readonly refresh: 'skip' | 'preferred' | 'required';
    /** What to do when a `preferred`/`required` synchronous refresh cannot reach the server. */
    readonly offlineFallback: 'use-cache' | 'fail';
}

/**
 * P-H07: decide whether a cached OPPF may be used as-is, or must be temporally re-validated with a
 * synchronous refresh, so that an expired license or a revoked security-sensitive policy (pins,
 * endpoints, permissions) cannot remain active for a whole session behind a background-only refresh.
 *
 * - Not expired and refreshed within the (clamped `refresh`-derived) staleness bound -> `skip`: the
 *   fast path (synchronous cached use + background refresh) is safe.
 * - Not expired but stale -> `preferred`: prefer a synchronous refresh; the still-valid cache is an
 *   acceptable offline fallback only within {@link OPPF_STALE_OFFLINE_MAX_MS} of the last successful
 *   refresh, otherwise it must fail (so blocking just the OnPrem host cannot keep a revoked signer
 *   alive indefinitely up to license expiry).
 * - Expired -> `required`: a synchronous refresh is mandatory; the expired cache may be used offline
 *   only within {@link OPPF_EXPIRED_OFFLINE_GRACE_MS} past its expiry, otherwise it must fail.
 */
export function decideCachedOppfUsage(
    input: CachedOppfTemporalInput,
    nowMs: u53,
): CachedOppfDecision {
    if (nowMs > input.expiresMs) {
        const withinGrace = nowMs <= input.expiresMs + OPPF_EXPIRED_OFFLINE_GRACE_MS;
        return {refresh: 'required', offlineFallback: withinGrace ? 'use-cache' : 'fail'};
    }
    const stalenessBoundMs = Math.min(
        Math.max(input.refreshSeconds * 1000, OPPF_MIN_STALENESS_MS),
        OPPF_MAX_STALENESS_MS,
    );
    if (nowMs - input.lastUpdatedMs > stalenessBoundMs) {
        const withinOfflineCap = nowMs - input.lastUpdatedMs <= OPPF_STALE_OFFLINE_MAX_MS;
        return {refresh: 'preferred', offlineFallback: withinOfflineCap ? 'use-cache' : 'fail'};
    }
    return {refresh: 'skip', offlineFallback: 'use-cache'};
}

/**
 * Decide whether a SUCCESSFUL background OPPF refresh should re-persist the staleness anchor
 * (`lastUpdated`). A successful fetch proves the cached OPPF is still current, so the anchor must
 * advance even when the content is byte-identical; otherwise a byte-stable OPPF's anchor never moves
 * past the original cache-write time and, once the staleness bound first elapses, every later launch
 * pays the synchronous startup fetch. To avoid an Argon2 keystore re-derivation on every rapid
 * relaunch, an unchanged refresh only re-persists once the anchor is older than
 * {@link OPPF_ANCHOR_REFRESH_INTERVAL_MS}; a changed refresh always re-persists (to re-cache).
 */
export function shouldRefreshOppfStalenessAnchor(input: {
    readonly contentChanged: boolean;
    readonly cachedLastUpdatedMs: u53;
    readonly nowMs: u53;
}): boolean {
    return (
        input.contentChanged ||
        input.nowMs - input.cachedLastUpdatedMs > OPPF_ANCHOR_REFRESH_INTERVAL_MS
    );
}

export function calculateOppfBodyOffset(data: ReadonlyUint8Array): number {
    // Calculate the offset where the OPPF body ends. Disregard any excess new-line (ASCII 0x0a)
    // characters between the content and the signature.
    let offset = ED25519_BASE64_ENCODED_SIGNATURE_LENGTH;
    for (const [, byte] of entriesReverse(data.subarray(0, -offset))) {
        if (byte !== 0x0a) {
            break;
        }
        ++offset;
    }

    return offset;
}

// Extract the raw OPPF file body and the signature
export function extractOppfBodyAndSignature(
    data: ReadonlyUint8Array,
    offset: number,
): {body: ReadonlyUint8Array; signature: ReadonlyUint8Array} {
    return {
        body: data.subarray(0, -offset),
        signature: data.subarray(-ED25519_BASE64_ENCODED_SIGNATURE_LENGTH),
    };
}

/**
 * FU-M10: reasons a caller-facing "is this a usable OPPF" check can report, e.g. so an onboarding
 * connect step can fail at entry with a clear message instead of failing much later (see
 * {@link classifyOppfVerificationError}).
 *
 * - `unreachable`: the server could not be reached, or responded with a non-2xx status. Classified
 *   by the caller BEFORE any of this module's code runs (this module never fetches over the
 *   network); {@link classifyOppfVerificationError} never returns this value.
 * - `untrusted-signer`: the OPPF is signed by a key that is not in the trusted set.
 * - `invalid-signature`: the signature does not match the body for a trusted signer's key.
 * - `malformed`: the response could not be parsed as a well-formed, schema-valid OPPF at all
 *   (invalid wire format, unparseable JSON, or any `OPPF_FILE_SCHEMA` validation failure such as a
 *   malformed `license.expires`). Also the catch-all for any error this module cannot otherwise
 *   attribute to one of the other reasons -- see {@link classifyOppfVerificationError}.
 * - `expired`: the OPPF parsed and was correctly signed, but its license has expired.
 */
export type OppfCheckFailureReason =
    | 'unreachable'
    | 'untrusted-signer'
    | 'invalid-signature'
    | 'malformed'
    | 'expired';

/** The subset of {@link OppfCheckFailureReason} that {@link verifyOppfFile} itself can produce. */
export type OppfVerificationFailureReason = Exclude<OppfCheckFailureReason, 'unreachable'>;

/**
 * Discriminated result of a caller-facing OPPF check (fetch + {@link verifyOppfFile}). Intentionally
 * a plain, never-thrown result rather than an exception: crossing a `Remote<T>` proxy boundary
 * (renderer <-> main/worker) strips a thrown error down to its message, losing any type information
 * needed to pick the right localized UI copy per failure reason.
 */
export type OppfSignatureCheckResult =
    | {readonly ok: true}
    | {readonly ok: false; readonly reason: OppfCheckFailureReason};

/**
 * Classify an error thrown by {@link verifyOppfFile} into the specific reason a caller-facing check
 * should report. Never throws.
 *
 * Fail-closed catch-all: any error not specifically recognized as an untrusted signer, an invalid
 * signature, or an expired license is classified as `'malformed'`. This is a deliberate, documented
 * decision, not an oversight: from a caller's perspective "we got a response but could not make
 * sense of it as a valid, current OPPF" already covers JSON syntax errors, OPPF wire-format
 * extraction failures (bad body/signature framing), and `OPPF_FILE_SCHEMA` validation failures
 * alike, and folding every otherwise-unclassified error into an existing reason keeps the taxonomy
 * at exactly the five reasons callers need to render distinct UI copy for -- it does not widen to a
 * sixth "unknown" bucket.
 */
export function classifyOppfVerificationError(error: unknown): OppfVerificationFailureReason {
    if (error instanceof CryptoError) {
        // Thrown by `verifyEd25519Signature` for a trusted signer whose signature does not match.
        return 'invalid-signature';
    }
    if (
        error instanceof Error &&
        error.message.startsWith('OPPF file is signed with an unknown signature key')
    ) {
        return 'untrusted-signer';
    }
    if (error instanceof Error && error.message.startsWith('OPPF file expired at')) {
        return 'expired';
    }
    return 'malformed';
}
