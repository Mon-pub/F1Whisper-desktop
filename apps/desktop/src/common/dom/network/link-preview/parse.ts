import {LINK_PREVIEW_MAX_FIELD_LENGTH} from '~/common/dom/network/link-preview/types';
import {isAllowedPreviewUrl} from '~/common/dom/network/link-preview/validator';

/**
 * Pure (no-I/O) parsing + URL-extraction helpers for link previews. Separated from the Node fetcher
 * so the parsing and the receive-side guard are exhaustively unit-testable.
 */

/**
 * A loose URL matcher: a run of non-space characters starting with `http://` or `https://`. We do
 * NOT try to fully validate here — every candidate is funnelled through {@link isAllowedPreviewUrl},
 * which is the authoritative gate. Trailing punctuation that is commonly adjacent to a URL in prose
 * is trimmed before validation.
 */
// `matchAll` requires the `g` flag; it is stateless per call (no shared `lastIndex`), so it is safe.
// eslint-disable-next-line threema/ban-stateful-regex-flags
const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s<>"']+/giu;

/** Trailing characters that are almost always sentence punctuation, not part of the URL. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"»]+$/u;

/**
 * Extract the FIRST previewable https URL from {@link text}: the first `https://` (or scheme-less,
 * defaulted to https) candidate that passes {@link isAllowedPreviewUrl}. Plain `http://` URLs are
 * skipped (https-only). Returns `undefined` if there is none.
 *
 * "First URL only" mirrors the Android fork (and Signal): a message previews at most one link.
 */
export function extractFirstPreviewUrl(text: string | undefined): string | undefined {
    if (text === undefined || text.length === 0) {
        return undefined;
    }
    for (const match of text.matchAll(URL_CANDIDATE_PATTERN)) {
        // Strip trailing prose punctuation (e.g. "see https://example.com." -> drop the dot).
        const candidate = match[0].replace(TRAILING_PUNCTUATION, '');
        if (candidate.toLowerCase().startsWith('http://')) {
            // Plain http is never previewed (https-only).
            continue;
        }
        if (isAllowedPreviewUrl(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Receive-side guard: a link-preview card may be rendered only if its URL passes the SSRF/spoofing
 * validator AND the URL actually appears in the message caption. This stops a malicious sender from
 * attaching a card for a URL the recipient never sees in the text (a phishing surface).
 */
export function isReceivedPreviewAllowed(url: string, caption: string | undefined): boolean {
    if (!isAllowedPreviewUrl(url)) {
        return false;
    }
    if (caption === undefined || caption.length === 0) {
        return false;
    }
    // The exact URL the sender claims to preview must be the same first previewable URL in the
    // caption (not merely a substring match, which a crafted caption could satisfy with a different
    // intended target).
    return extractFirstPreviewUrl(caption) === url;
}

/** Parsed Open Graph fields. */
export interface OpenGraph {
    readonly title: string | undefined;
    readonly description: string | undefined;
    readonly imageUrl: string | undefined;
}

// `matchAll` requires the `g` flag; stateless per call, so it is safe.
// eslint-disable-next-line threema/ban-stateful-regex-flags
const OG_TAG_PATTERN = /<\s*meta[^>]*property\s*=\s*["']\s*og:(?<property>[^"']+)["'][^>]*>/giu;
const CONTENT_PATTERN = /content\s*=\s*["'](?<content>[^"']*)["']/iu;
const TITLE_PATTERN = /<\s*title[^>]*>(?<title>[\s\S]*?)<\s*\/\s*title\s*>/iu;
const CHARSET_PATTERN = /charset\s*=\s*["']?\s*(?<charset>[a-zA-Z0-9\-_]+)/iu;

/**
 * Parse Open Graph `og:title` / `og:description` / `og:image` (and a `<title>` fallback) out of an
 * HTML document. Title/description are truncated; entities are decoded. Pure string processing — no
 * DOM, so it is safe in the worker and in tests.
 */
export function parseOpenGraph(html: string): OpenGraph {
    let title: string | undefined;
    let description: string | undefined;
    let imageUrl: string | undefined;

    for (const tag of html.matchAll(OG_TAG_PATTERN)) {
        const property = tag.groups?.property?.trim().toLowerCase();
        const contentMatch = CONTENT_PATTERN.exec(tag[0]);
        if (property === undefined || contentMatch === null) {
            continue;
        }
        const value = decodeEntities(contentMatch.groups?.content ?? '');
        switch (property) {
            case 'title':
                title ??= truncate(value);
                break;
            case 'description':
                description ??= truncate(value);
                break;
            case 'image':
            case 'image:url':
            case 'image:secure_url':
                imageUrl ??= value.trim() === '' ? undefined : value.trim();
                break;
            default:
                break;
        }
    }

    if (title === undefined || title.trim() === '') {
        const titleMatch = TITLE_PATTERN.exec(html);
        if (titleMatch !== null) {
            title = truncate(decodeEntities(titleMatch.groups?.title ?? ''));
        }
    }

    return {title, description, imageUrl};
}

/**
 * Sniff the charset for an HTML document: prefer the HTTP `Content-Type` charset, fall back to a
 * `<meta charset=...>` in the head, default UTF-8. Returns a label usable by {@link TextDecoder}.
 */
export function sniffCharset(headerCharset: string | undefined, headBytes: Uint8Array): string {
    if (headerCharset !== undefined && headerCharset.length > 0) {
        return headerCharset;
    }
    // Decode the first chunk as latin1 to scan for a meta charset without committing to an encoding.
    const ascii = new TextDecoder('latin1').decode(
        headBytes.subarray(0, Math.min(headBytes.byteLength, 4096)),
    );
    const charset = CHARSET_PATTERN.exec(ascii)?.groups?.charset;
    if (charset !== undefined) {
        return charset;
    }
    return 'utf-8';
}

function truncate(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    return trimmed.length <= LINK_PREVIEW_MAX_FIELD_LENGTH
        ? trimmed
        : trimmed.slice(0, LINK_PREVIEW_MAX_FIELD_LENGTH);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
};

/**
 * Decode the common HTML entities (named + numeric) found in OG attribute values. Deliberately
 * minimal: OG content is plain text, so we only need to undo entity escaping, not parse markup.
 */
export function decodeEntities(value: string): string {
    // The `g` flag is required for `.replace` to replace all entities; it is safe (no `.exec`).
    // eslint-disable-next-line threema/ban-stateful-regex-flags
    return value.replace(/&(?<body>#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (whole, body: string) => {
        if (body.startsWith('#x') || body.startsWith('#X')) {
            const code = Number.parseInt(body.slice(2), 16);
            return Number.isNaN(code) ? whole : safeFromCodePoint(code, whole);
        }
        if (body.startsWith('#')) {
            const code = Number.parseInt(body.slice(1), 10);
            return Number.isNaN(code) ? whole : safeFromCodePoint(code, whole);
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    });
}

function safeFromCodePoint(code: number, fallback: string): string {
    if (code < 0 || code > 0x10ffff) {
        return fallback;
    }
    try {
        return String.fromCodePoint(code);
    } catch {
        return fallback;
    }
}
