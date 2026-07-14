// NOTE: this module must NEVER import `node:*` as a value, neither statically nor via a dynamic
// `import()`. It lives under `common/dom`, whose bundle is shared with the renderer static graph (no
// `require` there), and it is bundled into the backend WORKER as an IIFE (where a dynamic
// `import("node:net")` is mis-resolved to an empty `__viteBrowserExternal` stub, so `isIP` etc. come
// back `undefined` -> "t is not a function"). The Node primitives it needs are therefore INJECTED
// via {@link LinkPreviewNodeApi} (built from static `node:*` imports in the worker-only
// `~/common/node/network/link-preview-node` module, where the externals plugin rewrites them to
// `require(...)`). Only TYPE imports of `node:*` are allowed here.
import type {IncomingHttpHeaders} from 'node:http';

import {parseOpenGraph, sniffCharset} from '~/common/dom/network/link-preview/parse';
import type {LinkPreviewImage} from '~/common/dom/network/link-preview/types';
import {isAllowedPreviewUrl} from '~/common/dom/network/link-preview/validator';
import type {Logger} from '~/common/logging';
import type {LinkPreviewNodeApi} from '~/common/node/network/link-preview-node';

/**
 * Sender-side Open Graph link-preview fetcher (F1Whisper Desktop fork), hardened against SSRF.
 *
 * ONLY the sending device runs this; the resulting preview travels end-to-end as an image message so
 * the recipient never contacts the target site. Runs in the backend WORKER (Node context), NEVER in
 * the renderer, and uses Node's own `https` stack — deliberately NOT the app's cert-pinned OnPrem
 * client (it talks to arbitrary third-party sites) and NOT Chromium's network stack (which is subject
 * to the OnPrem TLS pinning).
 *
 * SSRF model — same shape as Signal-Desktop's `linkPreviewFetch` (validate the URL, then a plain
 * HTTPS GET with manual redirects); deliberately NO hand-rolled DNS resolution / IP-pinning (that
 * custom `lookup` was fragile across Node versions and caused "Invalid IP address: undefined" +
 * silent-failure regressions). Defenses enforced here:
 *  - https only, no IP-literal/private/reserved/spoof host ({@link isAllowedPreviewUrl}; re-checked on
 *    EVERY redirect hop, which closes open-redirect SSRF e.g. a public URL that 302s to an internal
 *    address — the redirect target must itself pass the gate).
 *  - manual redirect following (bounded) with full re-validation of each `Location`.
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
 * Perform an HTTPS GET, following redirects MANUALLY and re-validating the SSRF URL gate at every hop.
 * Reads at most {@link MAX_HTML_BYTES} (or {@link MAX_IMAGE_BYTES} for image requests). Returns
 * `undefined` on any failure.
 *
 * Like Signal-Desktop's `linkPreviewFetch` (manual `redirect:'manual'` + `shouldPreviewHref` per hop),
 * the SSRF defense is the URL gate ({@link isAllowedPreviewUrl}); we do NOT pin the connection to a
 * pre-resolved IP (a hand-rolled custom `lookup` was fragile across Node versions and the source of
 * "Invalid IP address: undefined" / silent-failure bugs).
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
 * Issue ONE HTTPS GET to {@link url} using Node's own HTTPS stack (NOT the app's cert-pinned OnPrem
 * client, and NOT Chromium's pinned network stack). Node resolves + connects to the host normally —
 * no custom `lookup` / IP-pin (that hand-rolled pin was fragile and broke the fetch). Reads the body
 * capped at {@link maxBytes}; for redirect responses the body is discarded so the caller can follow.
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

    return await new Promise<RawResponse | undefined>((resolve) => {
        let settled = false;
        // NB: this runs in the backend WORKER, where `setTimeout` is the DOM global — it returns a
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
                // ignore
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
