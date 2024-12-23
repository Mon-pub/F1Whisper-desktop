import {EMOJIS_BY_GROUP, type SingleUnicodeEmoji} from '~/common/utils/emoji';

const MAXIMUM_SEARCH_RESULTS = 20;

export function findEmojiBySearchTerm(searchTerm: string): readonly {
    readonly emoji: SingleUnicodeEmoji;
    readonly label: string;
    readonly shortcode: string | undefined;
}[] {
    const result = [];
    for (const [, emojis] of EMOJIS_BY_GROUP) {
        for (const [emoji, details] of emojis) {
            if (
                details.label.includes(searchTerm) ||
                details.shortcode?.includes(searchTerm) === true
            ) {
                result.push({emoji, label: details.label, shortcode: details.shortcode});
                if (result.length === MAXIMUM_SEARCH_RESULTS) {
                    return result;
                }
            }
        }
    }
    return result;
}

/**
 * Normalizes the shortcode so that it is displayed in a more readable manner.
 */
export function normalizeShortcode(shortcode: string | undefined): string | undefined {
    return shortcode?.toLowerCase().replaceAll('_', ' ');
}
