/**
 * Generate a domain-monogram placeholder card image for a link preview whose page has no usable
 * og:image. Renderer-side (uses `OffscreenCanvas`), ported from the F1Whisper Android fork's
 * `LinkPreviewImageFactory.createPlaceholder`. The output is a freshly-encoded JPEG (no EXIF), so a
 * title-only link still yields a sendable MODEL-A image message.
 */

const PLACEHOLDER_WIDTH = 640;
const PLACEHOLDER_HEIGHT = 360;
const JPEG_QUALITY = 0.85;

// A small, calm palette; the host hash picks a deterministic colour (matches the Android palette).
const PALETTE: readonly string[] = [
    '#1E88E5',
    '#43A047',
    '#8E24AA',
    '#F4511E',
    '#00897B',
    '#3949AB',
    '#D81B60',
    '#6D4C41',
];

export async function generateLinkPreviewPlaceholder(url: string): Promise<
    | {
          readonly bytes: Uint8Array;
          readonly mediaType: string;
          readonly width: number;
          readonly height: number;
      }
    | undefined
> {
    try {
        let host: string;
        try {
            host = new URL(url).hostname;
        } catch {
            host = url;
        }
        if (host.startsWith('www.')) {
            host = host.slice(4);
        }
        if (host.length === 0) {
            host = url;
        }

        const color = PALETTE[Math.abs(hashString(host)) % PALETTE.length] ?? '#1E88E5';

        const canvas = new OffscreenCanvas(PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT);
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
            return undefined;
        }

        ctx.fillStyle = color;
        ctx.fillRect(0, 0, PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT);

        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Shrink the text until the host fits within the width with a margin.
        const maxWidth = PLACEHOLDER_WIDTH * 0.86;
        let fontSize = 64;
        const fontFamily =
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        ctx.font = `bold ${fontSize}px ${fontFamily}`;
        while (ctx.measureText(host).width > maxWidth && fontSize > 18) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px ${fontFamily}`;
        }

        ctx.fillText(host, PLACEHOLDER_WIDTH / 2, PLACEHOLDER_HEIGHT / 2, maxWidth);

        const blob = await canvas.convertToBlob({type: 'image/jpeg', quality: JPEG_QUALITY});
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.byteLength === 0) {
            return undefined;
        }
        return {
            bytes,
            mediaType: 'image/jpeg',
            width: PLACEHOLDER_WIDTH,
            height: PLACEHOLDER_HEIGHT,
        };
    } catch {
        return undefined;
    }
}

/** A small, deterministic, dependency-free string hash (Java `String.hashCode`-style). */
function hashString(value: string): number {
    /* eslint-disable no-bitwise */
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
    }
    return hash;
    /* eslint-enable no-bitwise */
}
