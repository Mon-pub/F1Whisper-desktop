/**
 * SSRF / spoofing validator for sender-side link previews (F1Whisper Desktop fork).
 *
 * Ported and HARDENED from the F1Whisper Android fork's `LinkPreviewValidator` (itself derived from
 * Signal's `LinkUtil.isValidPreviewUrl`). A URL must pass {@link isAllowedPreviewUrl} BOTH before it
 * is fetched AND on every HTTP redirect hop (see `fetcher.ts`). The same predicate is also run on the
 * RECEIVING side so a malicious sender cannot inject a card for a spoofed / dangerous URL.
 *
 * Two layers of defense:
 *
 *  1. {@link isAllowedPreviewUrl} — a pure, DNS-free, string-level gate: https-only, no
 *     directional-override / box-drawing spoof characters, no homograph host (mixed ASCII/non-ASCII),
 *     not in the host blocklist, and (when the host is an IP literal) not a private/loopback/etc.
 *     address. This matches what the receiver re-validates.
 *
 *  2. {@link isBlockedIpAddress} — the resolved-IP classifier. The fetcher resolves the hostname
 *     itself, runs EVERY resolved A/AAAA address through this, and only connects to a pre-validated
 *     IP (pinned via a custom `lookup`). This closes the DNS-rebinding / TOCTOU gap that the Android
 *     port explicitly left open (Android does no DNS resolution and accepts the rebinding risk).
 *
 * This module is PURE (no I/O) so the SSRF logic is exhaustively unit-testable.
 */

/**
 * Unicode directional overrides (U+202A..U+202E, U+2066..U+2069) and box-drawing glyphs
 * (U+2500..U+25FF). These are the classic display-spoofing surface in a URL.
 */
const ILLEGAL_CHARACTERS_PATTERN = /[‪-‮⁦-⁩─-◿]/u;

/** Consecutive dots or the Unicode ellipsis are not legal in a real host. */
const ILLEGAL_PERIODS_PATTERN = /[.…]{2,}/u;

// eslint-disable-next-line no-control-regex
const ALL_ASCII_PATTERN = /^[\x00-\x7F]*$/u;
// eslint-disable-next-line no-control-regex
const ALL_NON_ASCII_PATTERN = /^[^\x00-\x7F]*$/u;

/**
 * Hostnames that must never be previewed even though they are not IP literals: special-use /
 * reserved TLDs and `localhost`.
 */
const INVALID_DOMAINS_PATTERN =
    /^(?:.*\.)?(?:example|example\.com|example\.net|example\.org|i2p|invalid|localhost|onion|test)$/iu;

const IPV4_LITERAL_PATTERN = /^(?:\d{1,3})(?:\.\d{1,3}){3}$/u;

/**
 * Determine whether {@link url} is safe to fetch / render a link preview for, using string-level
 * checks only (no DNS resolution). This is the gate the SENDER runs before fetching and the RECEIVER
 * runs before rendering a card.
 *
 * IMPORTANT: a `true` result here does NOT by itself authorise a network connection — the fetcher
 * additionally resolves the host and validates every resolved IP via {@link isBlockedIpAddress}. A
 * `false` result, however, is always final: the URL is rejected outright.
 */
export function isAllowedPreviewUrl(url: string | undefined): boolean {
    if (url === undefined || url.length === 0) {
        return false;
    }

    // Reject before parsing: spoof characters anywhere in the raw string.
    if (ILLEGAL_CHARACTERS_PATTERN.test(url)) {
        return false;
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return false;
    }

    // HTTPS only. No http, data:, file:, ftp:, blob:, ...
    if (parsed.protocol !== 'https:') {
        return false;
    }

    // Reject embedded credentials (`https://user:pass@host`) — a phishing/obfuscation surface.
    if (parsed.username !== '' || parsed.password !== '') {
        return false;
    }

    // `URL.hostname` lower-cases and (for a Unicode host) punycode-encodes it to all-ASCII `xn--`
    // labels — which would silently pass the homograph check below. So we run the mixed-script check
    // on the RAW host as the user typed it (extracted from the original string), matching the Android
    // port's intent, and use the normalised `hostname` for the IP-literal / blocklist checks.
    const hostname = parsed.hostname;
    if (hostname.length === 0) {
        return false;
    }

    const rawHost = extractRawHost(url);
    const displayHost = rawHost ?? hostname;

    if (ILLEGAL_PERIODS_PATTERN.test(displayHost) || ILLEGAL_PERIODS_PATTERN.test(hostname)) {
        return false;
    }

    // Homograph defense: a host that mixes ASCII and non-ASCII characters (after removing dots) is
    // the classic spoofing surface (e.g. a Cyrillic "а" among Latin letters) -> reject. A wholly
    // non-ASCII IDN (which `URL` will have punycode-encoded) is allowed; a mixed one is not. We test
    // the RAW host so the pre-encoding mixed-script form is visible.
    const hostNoDots = displayHost.replaceAll('.', '');
    const allAscii = ALL_ASCII_PATTERN.test(hostNoDots);
    const allNonAscii = ALL_NON_ASCII_PATTERN.test(hostNoDots);
    if (!allAscii && !allNonAscii) {
        return false;
    }

    // Blocklist check against BOTH the raw and the normalised host (defense in depth).
    if (INVALID_DOMAINS_PATTERN.test(displayHost) || INVALID_DOMAINS_PATTERN.test(hostname)) {
        return false;
    }

    // If the host is an IP literal, classify it directly (no DNS needed). Hostnames are not resolved
    // here; the fetcher resolves + validates them at connect time.
    const ipLiteral = extractIpLiteral(hostname);
    if (ipLiteral !== undefined) {
        return !isBlockedIpAddress(ipLiteral);
    }

    // Require a dotted hostname (a real public domain has a TLD). This rejects bare single-label
    // hosts (`https://intranet/`, the accidental `https:///path` -> host "path", etc.), which would
    // otherwise be resolvable to an internal host via a DNS search domain — an SSRF surface. Public
    // sites always have a multi-label host.
    if (!hostname.includes('.')) {
        return false;
    }

    return true;
}

/**
 * If {@link host} is an IP literal (`1.2.3.4` or a bracketed/bare IPv6), return the bare address
 * string; otherwise `undefined`.
 */
function extractIpLiteral(host: string): string | undefined {
    let candidate = host;
    // `URL.hostname` keeps IPv6 hosts bracketed: `[::1]`.
    if (candidate.startsWith('[') && candidate.endsWith(']')) {
        candidate = candidate.slice(1, -1);
    }
    if (IPV4_LITERAL_PATTERN.test(candidate)) {
        return candidate;
    }
    if (candidate.includes(':')) {
        // Looks like an IPv6 literal.
        return candidate;
    }
    return undefined;
}

/**
 * Extract the host substring from a raw URL string EXACTLY as the user typed it (before `URL`
 * lower-casing / punycode-encoding), so the homograph check sees the original mixed-script form.
 * Returns `undefined` if the authority cannot be isolated (caller then falls back to the normalised
 * `URL.hostname`, which is safe — an all-ASCII punycode host).
 */
function extractRawHost(url: string): string | undefined {
    // scheme://[userinfo@]host[:port][/...]
    const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\//iu.exec(url);
    if (schemeMatch === null) {
        return undefined;
    }
    let rest = url.slice(schemeMatch[0].length);
    // Authority ends at the first '/', '?' or '#'.
    const authorityEnd = rest.search(/[/?#]/u);
    if (authorityEnd >= 0) {
        rest = rest.slice(0, authorityEnd);
    }
    // Strip userinfo.
    const at = rest.lastIndexOf('@');
    if (at >= 0) {
        rest = rest.slice(at + 1);
    }
    if (rest.length === 0) {
        return undefined;
    }
    // Bracketed IPv6 literal: return the bare address (no port stripping inside brackets).
    if (rest.startsWith('[')) {
        const close = rest.indexOf(']');
        return close >= 0 ? rest.slice(1, close) : undefined;
    }
    // Strip a trailing :port (an IPv4/hostname has at most one colon, for the port).
    const colon = rest.lastIndexOf(':');
    if (colon >= 0) {
        rest = rest.slice(0, colon);
    }
    return rest.length > 0 ? rest : undefined;
}

/**
 * Classify a resolved or literal IP address as blocked (private / loopback / link-local / ULA /
 * CGNAT / multicast / unspecified / IPv4-mapped-IPv6 / etc.) for SSRF purposes.
 *
 * The fetcher calls this for EVERY address the resolver returns for a host, before any connection is
 * made. Returns `true` if the address must NOT be connected to.
 *
 * @param ip A bare IP literal string (no brackets, no zone id). IPv4 dotted-quad or IPv6.
 */
export function isBlockedIpAddress(ip: string): boolean {
    const stripped = stripZoneAndBrackets(ip);
    const v4 = parseIpv4(stripped);
    if (v4 !== undefined) {
        return isBlockedIpv4(v4);
    }
    const v6 = parseIpv6(stripped);
    if (v6 !== undefined) {
        return isBlockedIpv6(v6);
    }
    // Not a parseable IP — fail closed.
    return true;
}

function stripZoneAndBrackets(ip: string): string {
    let value = ip.trim();
    if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
    }
    // Strip an IPv6 zone id (`fe80::1%eth0`).
    const percent = value.indexOf('%');
    if (percent >= 0) {
        value = value.slice(0, percent);
    }
    return value;
}

/** Parse an IPv4 dotted-quad into 4 octets, or `undefined` if invalid. */
function parseIpv4(ip: string): readonly [number, number, number, number] | undefined {
    if (!IPV4_LITERAL_PATTERN.test(ip)) {
        return undefined;
    }
    const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4) {
        return undefined;
    }
    const [a, b, c, d] = parts;
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
        return undefined;
    }
    for (const part of [a, b, c, d]) {
        if (!Number.isInteger(part) || part < 0 || part > 255) {
            return undefined;
        }
    }
    return [a, b, c, d] as const;
}

/**
 * Block all IPv4 ranges that must never be the target of a preview fetch (anti-SSRF). Covers every
 * range the task requires: loopback, RFC1918 private, link-local, CGNAT, multicast, the `0.0.0.0/8`
 * "this host" range, benchmarking, documentation, and the reserved/broadcast space.
 */
function isBlockedIpv4(octets: readonly [number, number, number, number]): boolean {
    const [a, b, c] = octets;
    return (
        a === 0 || // 0.0.0.0/8 "this host" (incl. 0.0.0.0)
        a === 10 || // 10.0.0.0/8 private (RFC1918)
        a === 127 || // 127.0.0.0/8 loopback
        (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT (RFC6598)
        (a === 169 && b === 254) || // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private (RFC1918)
        (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24 IETF protocol assignments
        (a === 192 && b === 0 && c === 2) || // 192.0.2.0/24 TEST-NET-1
        (a === 192 && b === 88 && c === 99) || // 192.88.99.0/24 6to4 relay anycast
        (a === 192 && b === 168) || // 192.168.0.0/16 private (RFC1918)
        (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
        (a === 198 && b === 51 && c === 100) || // 198.51.100.0/24 TEST-NET-2
        (a === 203 && b === 0 && c === 113) || // 203.0.113.0/24 TEST-NET-3
        a >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
    );
}

/**
 * Parse an IPv6 address (including IPv4-mapped/compat forms) into 16 bytes, or `undefined` if
 * invalid.
 */
function parseIpv6(ip: string): Uint8Array | undefined {
    if (!ip.includes(':')) {
        return undefined;
    }

    // Split off an embedded IPv4 tail (`::ffff:1.2.3.4`).
    let head = ip;
    let tailBytes: readonly [number, number, number, number] | undefined;
    const lastColon = ip.lastIndexOf(':');
    const possibleV4 = ip.slice(lastColon + 1);
    if (possibleV4.includes('.')) {
        const v4 = parseIpv4(possibleV4);
        if (v4 === undefined) {
            return undefined;
        }
        tailBytes = v4;
        // Keep the trailing colon for the group parsing below.
        head = ip.slice(0, lastColon + 1);
    }

    const doubleColon = head.indexOf('::');
    let groups: string[];
    if (doubleColon >= 0) {
        if (head.indexOf('::', doubleColon + 1) >= 0) {
            // More than one "::" is invalid.
            return undefined;
        }
        const before = head
            .slice(0, doubleColon)
            .split(':')
            .filter((group) => group.length > 0);
        const after = head
            .slice(doubleColon + 2)
            .split(':')
            .filter((group) => group.length > 0);
        const tailGroupCount = tailBytes !== undefined ? 2 : 0;
        const explicit = before.length + after.length + tailGroupCount;
        if (explicit > 8) {
            return undefined;
        }
        const missing = 8 - explicit;
        groups = [...before, ...new Array<string>(missing).fill('0'), ...after];
    } else {
        // No "::": each group is explicit (any embedded IPv4 tail was already split off above).
        groups = head.split(':').filter((group) => group.length > 0);
    }

    const expectedGroups = tailBytes !== undefined ? 6 : 8;
    if (groups.length !== expectedGroups) {
        return undefined;
    }

    /* eslint-disable no-bitwise */
    const bytes = new Uint8Array(16);
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (group === undefined || !/^[0-9a-fA-F]{1,4}$/u.test(group)) {
            return undefined;
        }
        const value = Number.parseInt(group, 16);
        bytes[i * 2] = (value >> 8) & 0xff;
        bytes[i * 2 + 1] = value & 0xff;
    }
    /* eslint-enable no-bitwise */
    if (tailBytes !== undefined) {
        bytes[12] = tailBytes[0];
        bytes[13] = tailBytes[1];
        bytes[14] = tailBytes[2];
        bytes[15] = tailBytes[3];
    }
    return bytes;
}

/**
 * Block IPv6 ranges that must never be the target of a preview fetch: unspecified `::`, loopback
 * `::1`, ULA `fc00::/7`, link-local `fe80::/10`, multicast `ff00::/8`, the deprecated site-local
 * `fec0::/10`, discard `100::/64`, documentation `2001:db8::/32`, and IPv4-mapped / IPv4-compatible
 * addresses whose embedded IPv4 is itself blocked (and ALL such mapped addresses, to be safe).
 */
function isBlockedIpv6(bytes: Uint8Array): boolean {
    // Unspecified `::`.
    if (bytes.every((byte) => byte === 0)) {
        return true;
    }
    // Loopback `::1`.
    if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) {
        return true;
    }

    const b0 = bytes[0] ?? 0;
    const b1 = bytes[1] ?? 0;

    /* eslint-disable no-bitwise */
    // ULA `fc00::/7`.
    if ((b0 & 0xfe) === 0xfc) {
        return true;
    }
    // Link-local `fe80::/10`.
    if (b0 === 0xfe && (b1 & 0xc0) === 0x80) {
        return true;
    }
    // Deprecated site-local `fec0::/10`.
    if (b0 === 0xfe && (b1 & 0xc0) === 0xc0) {
        return true;
    }
    /* eslint-enable no-bitwise */
    // Multicast `ff00::/8`.
    if (b0 === 0xff) {
        return true;
    }
    // Discard-only 100::/64
    if (
        b0 === 0x01 &&
        b1 === 0x00 &&
        bytes[2] === 0 &&
        bytes[3] === 0 &&
        bytes[4] === 0 &&
        bytes[5] === 0 &&
        bytes[6] === 0 &&
        bytes[7] === 0
    ) {
        return true;
    }
    // Documentation 2001:db8::/32
    if (b0 === 0x20 && b1 === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
        return true;
    }

    // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 — these embed an IPv4 address; an attacker
    // could try to smuggle a private IPv4 target through an IPv6 literal. The first 10 bytes are
    // zero for both forms; treat ANY such address as blocked (we never legitimately preview an
    // IPv4-in-IPv6 literal), and additionally classify the embedded IPv4 for defense in depth.
    const firstTenZero = bytes.slice(0, 10).every((byte) => byte === 0);
    if (firstTenZero) {
        const isV4Mapped = bytes[10] === 0xff && bytes[11] === 0xff;
        const isV4Compat = bytes[10] === 0x00 && bytes[11] === 0x00;
        if (isV4Mapped || isV4Compat) {
            return true;
        }
    }

    return false;
}
