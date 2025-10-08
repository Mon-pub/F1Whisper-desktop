import type {EmojiGroupId, Emojis, SingleUnicodeEmoji} from '~/common/utils/emoji';

const MAXIMUM_SEARCH_RESULTS = 20;

export function findEmojiBySearchTerm(
    searchTerm: string,
    localeSpecificEmojiMap: ReadonlyMap<EmojiGroupId, Emojis>,
): readonly {
    readonly emoji: SingleUnicodeEmoji;
    readonly label: string;
    readonly shortcode: string | undefined;
}[] {
    const result = [];
    const searchTermLowerCase = searchTerm.toLocaleLowerCase();

    for (const [, emojis] of localeSpecificEmojiMap) {
        for (const [emoji, details] of emojis) {
            if (result.length === MAXIMUM_SEARCH_RESULTS) {
                return result;
            }

            if (
                details.label.includes(searchTermLowerCase) ||
                details.shortcode?.includes(searchTermLowerCase) === true ||
                details.shortcode?.includes(normalizeSearchTerm(searchTermLowerCase)) === true
            ) {
                result.push({emoji, label: details.label, shortcode: details.shortcode});
                continue;
            }
            for (const tag of details.tags) {
                if (tag.includes(searchTermLowerCase)) {
                    result.push({emoji, label: details.label, shortcode: details.shortcode});
                    break;
                }
            }
        }
    }
    return result;
}

/**
 * Replaces a `ss` by a `ß` so that Swiss and Austrian people may find German annotated emojis.
 */
function normalizeSearchTerm(searchTerm: string): string {
    return searchTerm.replace('ss', 'ß');
}

/**
 * To transform German into German-CH, we replace the Eszett by a Swiss double-s.
 */
export function normalizeShortcode(shortcode: string | undefined): string | undefined {
    return shortcode?.toLowerCase().replace('ß', 'ss');
}
