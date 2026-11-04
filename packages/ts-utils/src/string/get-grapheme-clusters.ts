/**
 * Split the beginning of a string into grapheme clusters, i.e. into user-perceived characters, each
 * of which might consist of more than a single code point (e.g. an emoji with a skin tone modifier,
 * or a letter followed by a combining accent).
 *
 * Note: If the runtime does not provide {@link Intl.Segmenter}, this falls back to splitting `text`
 * into single UTF-16 code units, which breaks up clusters as well as code points outside of
 * Unicode's Basic Multilingual Plane (BMP).
 *
 * @param text The string to split into grapheme clusters.
 * @param count The maximum amount of leading grapheme clusters to return.
 * @returns The first `count` grapheme clusters of `text`, or fewer if `text` consists of less.
 */
// TODO(DESK-1334): Use the system language instead of "en".
export function getGraphemeClusters(text: string, count = 1): string[] {
    const clusters = [];
    if (Object.hasOwn(Intl, 'Segmenter')) {
        const segmenter = new Intl.Segmenter('en', {granularity: 'grapheme'});
        const segments = segmenter.segment(text);
        const iterator = segments[Symbol.iterator]();
        for (let i = 0; i < count; i++) {
            const segment = iterator.next();
            if (segment.done !== true) {
                clusters.push(segment.value.segment);
            } else {
                break;
            }
        }
    } else {
        for (let i = 0; i < Math.min(count, text.length); i++) {
            clusters.push(text.slice(i, i + 1));
        }
    }
    return clusters;
}
