// NOTE: this module must NEVER import `node:*` as a value, neither statically nor via a dynamic
// `import()`. It lives under `common/dom`, whose bundle is shared with the renderer static graph (no
// `require` there), and it is bundled into the backend WORKER as an IIFE (where a dynamic
// `import("node:net")` is mis-resolved to an empty `__viteBrowserExternal` stub, so `isIP` etc. come
// back `undefined` -> "t is not a function"). The Node primitives it needs are therefore INJECTED
// via {@link LinkPreviewNodeApi} (built from static `node:*` imports in the worker-only
// `~/common/node/network/link-preview-node` module, where the externals plugin rewrites them to
// `require(...)`). Only TYPE imports of `node:*` are allowed here.
import type {IncomingHttpHeaders} from 'node:http';
import type {LookupFunction} from 'node:net';

import {parseOpenGraph, sniffCharset} from '~/common/dom/network/link-preview/parse';
import type {LinkPreviewImage} from '~/common/dom/network/link-preview/types';
import {isAllowedPreviewUrl, isBlockedIpAddress} from '~/common/dom/network/link-preview/validator';
import type {Logger} from '~/common/logging';
import type {
    LinkPreviewNodeApi,
    ResolvedPreviewAddress,
} from '~/common/node/network/link-preview-node';

/**
 * Sender-side Open Graph link-preview fetcher (F1Whisper Desktop fork), hardened against SSRF.
 *
 * ONLY the sending device runs this; the resulting preview travels end-to-end as an image message so
 * the recipient never contacts the target site. Runs in the backend WORKER (Node context), NEVER in
 * the renderer, and uses Node's own `https` stack, deliberately NOT the app's cert-pinned OnPrem
 * client (it talks to arbitrary third-party sites) and NOT Chromium's network stack (which is subject
 * to the OnPrem TLS pinning).
 *
 * SSRF model, same shape as Signal-Desktop's `linkPreviewFetch` (validate the URL, then a plain HTTPS
 * GET with manual redirects), PLUS DNS-resolution pinning to close the rebinding/TOCTOU gap a
 * string-only validator cannot: a hostname can look public in {@link isAllowedPreviewUrl} yet resolve
 * to a loopback/RFC1918/link-local/ULA/CGNAT/metadata address by the time the socket actually connects
 * (either because the attacker controls DNS for that name, or a redirect target resolves that way).
 * Defenses enforced here:
 *  - https only, no IP-literal/private/reserved/spoof host ({@link isAllowedPreviewUrl}; re-checked on
 *    EVERY redirect hop, which closes open-redirect SSRF e.g. a public URL that 302s to an internal
 *    address; the redirect target must itself pass the gate).
 *  - DNS-resolution pinning ({@link resolveAllowedAddresses} / {@link pinnedLookup}, run per hop
 *    inside `singleRequest`): every A/AAAA answer for the hop's hostname is resolved ONCE, every
 *    answer is classified with {@link isBlockedIpAddress}, and the request's `lookup` option is pinned
 *    to only the surviving (allowed) answers; the original hostname is still sent for SNI/`Host`/
 *    certificate validation, only the TCP destination is pinned. Because the same resolution result is
 *    used for both the policy check and the connect, there is no second, uncontrolled DNS query for an
 *    attacker to rebind against.
 *  - manual redirect following (bounded) with full re-validation (string gate + fresh DNS pin) of each
 *    `Location`.
 *  - body byte caps (HTML 2 MB, image 2 MB), short timeouts, no cookies, no cache.
 *  - the og:image is decoded + re-encoded (EXIF/GPS stripped) and size-capped by the caller.
 *
 * The caller ({@link LinkPreviewBackendImpl}) handles EXIF-strip/re-encode and placeholder generation
 * via the DOM canvas (available in the worker); this module returns the RAW fetched image bytes.
 */

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MiB
const MAX_REDIRECTS = 5;
const CONNECT_TIMEOUT_MS = 5_000;
const RESPONSE_TIMEOUT_MS = 10_000;

// A neutral desktop UA: many sites only emit Open Graph tags for "browser" user agents.
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** The raw (not yet re-encoded) outcome of a fetch. */
export interface RawFetchedPreview {
    readonly url: string;
    readonly title: string | undefined;
    readonly description: string | undefined;
    /** Raw og:image bytes (un-re-encoded), or `undefined` if the page had no usable image. */
    readonly rawImageBytes: Uint8Array | undefined;
    readonly rawImageMediaType: string | undefined;
}

interface RawResponse {
    readonly statusCode: number;
    readonly headers: IncomingHttpHeaders;
    /** `undefined` for redirect responses (body not read). */
    readonly body: Uint8Array | undefined;
    readonly finalUrl: string;
    readonly contentType: string | undefined;
}

/**
 * Fetch and parse the Open Graph preview for {@link rawUrl}. Returns `undefined` when the URL is
 * invalid, the fetch fails, or there is nothing previewable. NEVER throws.
 *
 * @param node The injected Node `net`/`dns`/`https` primitives (see {@link LinkPreviewNodeApi}). This
 *   module must not import `node:*` itself (see the file header), so the worker supplies them.
 */
export async function fetchRawPreview(
    rawUrl: string,
    node: LinkPreviewNodeApi,
    log: Logger,
): Promise<RawFetchedPreview | undefined> {
    if (!isAllowedPreviewUrl(rawUrl)) {
        return undefined;
    }
    try {
        const response = await requestWithRedirects(
            rawUrl,
            'text/html,application/xhtml+xml',
            node,
            log,
        );
        if (response === undefined || response.statusCode < 200 || response.statusCode >= 300) {
            return undefined;
        }
        if (response.body === undefined) {
            return undefined;
        }

        // If the URL itself is an image, use it directly as the preview image.
        if (response.contentType?.toLowerCase().startsWith('image/') === true) {
            return {
                url: rawUrl,
                title: undefined,
                description: undefined,
                rawImageBytes: response.body,
                rawImageMediaType: normaliseImageMediaType(response.contentType),
            };
        }

        const charset = sniffCharset(parseCharset(response.contentType), response.body);
        const html = decodeHtml(response.body, charset);
        const og = parseOpenGraph(html);

        let rawImageBytes: Uint8Array | undefined;
        let rawImageMediaType: string | undefined;
        if (og.imageUrl !== undefined && og.imageUrl.trim() !== '') {
            const resolved = resolveUrl(response.finalUrl, og.imageUrl);
            if (resolved !== undefined && isAllowedPreviewUrl(resolved)) {
                const imageResponse = await requestWithRedirects(resolved, 'image/*', node, log);
                if (
                    imageResponse?.body !== undefined &&
                    imageResponse.statusCode >= 200 &&
                    imageResponse.statusCode < 300
                ) {
                    rawImageBytes = imageResponse.body;
                    rawImageMediaType = normaliseImageMediaType(imageResponse.contentType);
                }
            }
        }

        if ((og.title === undefined || og.title.trim() === '') && rawImageBytes === undefined) {
            return undefined;
        }
        return {
            url: rawUrl,
            title: og.title,
            description: og.description,
            rawImageBytes,
            rawImageMediaType,
        };
    } catch (error) {
        log.debug(`Link preview fetch failed: ${error instanceof Error ? error.message : error}`);
        return undefined;
    }
}

/**
 * Perform an HTTPS GET, following redirects MANUALLY and re-validating the SSRF URL gate AND the DNS
 * resolution pin at every hop. Reads at most {@link MAX_HTML_BYTES} (or {@link MAX_IMAGE_BYTES} for
 * image requests). Returns `undefined` on any failure.
 *
 * Like Signal-Desktop's `linkPreviewFetch` (manual `redirect:'manual'` + `shouldPreviewHref` per hop),
 * the first defense is the URL gate ({@link isAllowedPreviewUrl}). `singleRequest` additionally
 * resolves + pins the connection for each hop (see the module header), which closes the DNS-rebinding
 * gap the URL gate alone cannot.
 */
async function requestWithRedirects(
    startUrl: string,
    accept: string,
    node: LinkPreviewNodeApi,
    log: Logger,
): Promise<RawResponse | undefined> {
    let currentUrl = startUrl;
    const isImageRequest = accept.startsWith('image/');
    const maxBytes = isImageRequest ? MAX_IMAGE_BYTES : MAX_HTML_BYTES;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        // Re-validate the URL at EVERY hop (the start URL was validated by the caller, but redirect
        // targets have not been). This is the SSRF gate: https-only, no IP-literal/private/reserved
        // host, no spoof characters.
        if (!isAllowedPreviewUrl(currentUrl)) {
            log.debug('Link preview redirect target failed validation');
            return undefined;
        }

        const response = await singleRequest(currentUrl, accept, maxBytes, node, log);
        if (response === undefined) {
            return undefined;
        }

        // 3xx with a Location -> follow manually after re-validation in the next loop iteration.
        const location = asString(response.headers.location);
        if (response.statusCode >= 300 && response.statusCode < 400 && location !== undefined) {
            const next = resolveUrl(currentUrl, location);
            if (next === undefined) {
                return undefined;
            }
            currentUrl = next;
            continue;
        }

        return response;
    }
    log.debug('Link preview exceeded the maximum redirect count');
    return undefined;
}

/**
 * Resolve every A/AAAA answer for {@link hostname} (via the injected {@link LinkPreviewNodeApi})
 * and keep only the addresses that pass the SSRF policy ({@link isBlockedIpAddress}).
 *
 * Returns `undefined` if resolution fails outright, or if EVERY resolved answer is blocked (a mixed
 * public/private answer set is NOT rejected wholesale; only the blocked members are dropped, and the
 * caller pins the connection to one of the surviving allowed addresses). This single resolution is
 * reused for both the policy decision and the actual connect ({@link pinnedLookup}), so there is no
 * separate, later DNS query for an attacker to rebind against.
 */
async function resolveAllowedAddresses(
    hostname: string,
    node: LinkPreviewNodeApi,
    log: Logger,
): Promise<readonly ResolvedPreviewAddress[] | undefined> {
    let resolved: readonly ResolvedPreviewAddress[];
    try {
        resolved = await node.resolveHostAddresses(hostname);
    } catch (error) {
        log.debug(
            `Link preview DNS resolution failed: ${error instanceof Error ? error.message : error}`,
        );
        return undefined;
    }
    const allowed = resolved.filter((candidate) => !isBlockedIpAddress(candidate.address));
    if (allowed.length === 0) {
        log.debug(
            'Link preview host resolved only to blocked (private/loopback/link-local/etc.) addresses',
        );
        return undefined;
    }
    return allowed;
}

/**
 * Build a Node `LookupFunction` (the `lookup` option of `https.request`) that answers ONLY with
 * addresses from {@link allowed}, the DNS answers already resolved and vetted by
 * {@link resolveAllowedAddresses}. This is the actual pin: whatever address this function hands back
 * is the address Node's `net.Socket` connects the TCP socket to, so a blocked address can never be
 * dialed even if `hostname` would resolve to one on a fresh, uncontrolled query. `hostname`/SNI/`Host`
 * are unaffected; those come from the `hostname` field of the request options, not from `lookup`.
 *
 * Honors a specific requested family (4 or 6) when present among the allowed answers; otherwise falls
 * back to the first allowed answer. Never performs I/O itself (synchronous, pure data selection); the
 * class of Node-version-dependent DNS-callback fragility this file's history warns about lived in
 * hand-rolled code that tried to resolve live INSIDE the `lookup` callback; this closure only replays
 * an already-resolved, already-vetted result.
 */
function pinnedLookup(allowed: readonly ResolvedPreviewAddress[]): LookupFunction {
    return (hostname, options, callback) => {
        if (options.all === true) {
            callback(
                null,
                allowed.map((candidate) => ({address: candidate.address, family: candidate.family})),
            );
            return;
        }
        const wantedFamily = normaliseFamily(options.family);
        const chosen =
            (wantedFamily !== undefined
                ? allowed.find((candidate) => candidate.family === wantedFamily)
                : undefined) ?? allowed[0];
        if (chosen === undefined) {
            // Unreachable in practice (resolveAllowedAddresses never returns an empty array), but
            // never call back with an undefined address; fail closed with an explicit error instead.
            // (No explicit `NodeJS.ErrnoException` annotation needed: a plain `Error` structurally
            // satisfies it, since every field it adds beyond `Error` is optional.)
            callback(new Error('link preview: no allowed address to connect to'), '');
            return;
        }
        callback(null, chosen.address, chosen.family);
    };
}

function normaliseFamily(family: number | 'IPv4' | 'IPv6' | undefined): 4 | 6 | undefined {
    if (family === 4 || family === 'IPv4') {
        return 4;
    }
    if (family === 6 || family === 'IPv6') {
        return 6;
    }
    return undefined;
}

/**
 * Issue ONE HTTPS GET to {@link url} using Node's own HTTPS stack (NOT the app's cert-pinned OnPrem
 * client, and NOT Chromium's pinned network stack). The hostname is resolved and pinned via
 * {@link resolveAllowedAddresses} / {@link pinnedLookup} BEFORE the request is issued; Node's
 * `lookup` option controls only which address the socket connects to; the original hostname is still
 * sent for SNI, the `Host` header, and TLS certificate validation. Reads the body capped at
 * {@link maxBytes}; for redirect responses the body is discarded so the caller can follow.
 */
async function singleRequest(
    url: string,
    accept: string,
    maxBytes: number,
    node: LinkPreviewNodeApi,
    log: Logger,
): Promise<RawResponse | undefined> {
    const {httpsRequest} = node;

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }

    const allowedAddresses = await resolveAllowedAddresses(parsed.hostname, node, log);
    if (allowedAddresses === undefined) {
        return undefined;
    }

    return await new Promise<RawResponse | undefined>((resolve) => {
        let settled = false;
        // NB: this runs in the backend WORKER, where `setTimeout` is the DOM global; it returns a
        // NUMBER and has NO `.unref()`. So never call `.unref()` here (it throws); instead clear the
        // timer on finish so it cannot leak.
        let responseTimer: ReturnType<typeof setTimeout> | undefined;
        function finish(value: RawResponse | undefined): void {
            if (settled) {
                return;
            }
            settled = true;
            if (responseTimer !== undefined) {
                clearTimeout(responseTimer);
                responseTimer = undefined;
            }
            resolve(value);
        }

        let request: ReturnType<LinkPreviewNodeApi['httpsRequest']> | undefined;
        try {
            request = httpsRequest(
                {
                    protocol: parsed.protocol,
                    hostname: parsed.hostname,
                    port: parsed.port === '' ? 443 : parsed.port,
                    path: `${parsed.pathname}${parsed.search}`,
                    method: 'GET',
                    // Pin the TCP destination to one of the pre-vetted, non-blocked addresses
                    // resolved above. `hostname` above (unchanged) still governs the `Host` header,
                    // TLS SNI, and certificate validation; only the actual connect address is pinned.
                    lookup: pinnedLookup(allowedAddresses),
                    headers: {
                        'user-agent': USER_AGENT,
                        accept,
                        'accept-language': 'en',
                        // No cookies; explicitly defeat any caching layer.
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache',
                    },
                    timeout: CONNECT_TIMEOUT_MS,
                },
                (response) => {
                    const statusCode = response.statusCode ?? 0;
                    const contentType = asString(response.headers['content-type']);

                    // For redirects, don't read the body.
                    if (statusCode >= 300 && statusCode < 400) {
                        response.resume(); // Drain + free the socket
                        finish({
                            statusCode,
                            headers: response.headers,
                            body: undefined,
                            finalUrl: url,
                            contentType,
                        });
                        return;
                    }

                    const chunks: Uint8Array[] = [];
                    let total = 0;
                    response.on('data', (chunk: Uint8Array) => {
                        total += chunk.byteLength;
                        if (total > maxBytes) {
                            log.debug('Link preview response exceeded the byte cap');
                            request?.destroy();
                            finish(undefined);
                            return;
                        }
                        chunks.push(chunk);
                    });
                    response.on('end', () => {
                        finish({
                            statusCode,
                            headers: response.headers,
                            body: concatChunks(chunks, total),
                            finalUrl: url,
                            contentType,
                        });
                    });
                    response.on('error', () => finish(undefined));
                },
            );

            // Attach the error handler FIRST, before anything else can throw, so a failed or orphaned
            // request can NEVER surface as an uncaught exception (an HTTP request with no 'error'
            // listener re-throws the error globally in Node).
            request.on('error', () => finish(undefined));
            request.on('timeout', () => {
                request?.destroy();
                finish(undefined);
            });
            // Hard ceiling on the whole request, independent of the connect/idle timeout.
            responseTimer = setTimeout(() => {
                request?.destroy();
                finish(undefined);
            }, RESPONSE_TIMEOUT_MS);
            request.end();
        } catch (error) {
            log.debug(
                `Link preview request setup failed: ${error instanceof Error ? error.message : error}`,
            );
            try {
                request?.destroy();
            } catch {
                // Ignore
            }
            finish(undefined);
        }
    });
}

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

function decodeHtml(bytes: Uint8Array, charset: string): string {
    try {
        return new TextDecoder(charset).decode(bytes);
    } catch {
        return new TextDecoder('utf-8').decode(bytes);
    }
}

function parseCharset(contentType: string | undefined): string | undefined {
    if (contentType === undefined) {
        return undefined;
    }
    const match = /charset\s*=\s*"?(?<charset>[a-zA-Z0-9\-_]+)"?/iu.exec(contentType);
    return match?.groups?.charset;
}

function normaliseImageMediaType(contentType: string | undefined): string | undefined {
    if (contentType === undefined) {
        return undefined;
    }
    const type = contentType.split(';')[0]?.trim().toLowerCase();
    return type?.startsWith('image/') === true ? type : undefined;
}

/** Resolve a possibly-relative URL against a base. Returns `undefined` on failure. */
function resolveUrl(base: string, target: string): string | undefined {
    try {
        return new URL(target, base).toString();
    } catch {
        return undefined;
    }
}

function asString(value: string | string[] | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    return Array.isArray(value) ? value[0] : value;
}

/** Re-exported for the backend's image re-encode step. */
export {MAX_IMAGE_BYTES};
export type {LinkPreviewImage};

/** Exported for direct unit testing of the DNS-resolution SSRF pin (see the P-H02 regression spec). */
export {resolveAllowedAddresses, pinnedLookup};
