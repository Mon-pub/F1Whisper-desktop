import rawEmojiHexcodeData from 'emojibase-data/meta/hexcodes.json' with {type: 'json'};

import {tag, type u53, type WeakOpaque} from '~/common/types';
import {assert} from '~/common/utils/assert';

// Legacy Mappings.

// Important: Make sure the emojis used here are the fully-qualified variants.
export const DEFAULT_THUMBS_UP_EMOJI = tag<SingleUnicodeEmoji>('👍');
export const DEFAULT_THUMBS_DOWN_EMOJI = tag<SingleUnicodeEmoji>('👎');
export const THUMBS_UP_EMOJIS = new Set(
    ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'].map(tag<SingleUnicodeEmoji>),
);
export const THUMBS_DOWN_EMOJIS = new Set(
    ['👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿'].map(tag<SingleUnicodeEmoji>),
);

// The Unicode symbol that unsupported emojis should be mapped to.
export const UNSUPPORTED_EMOJI_MAPPING = tag<UnsupportedEmoji>('�');

// Emoji groups.

/**
 * All possible emoji group keys.
 *
 * Note: This must be a subset of the keys used in `emojibase-data`.
 */
export const EMOJI_GROUP_IDS = [
    'smileys-emotion',
    'people-body',
    'animals-nature',
    'food-drink',
    'travel-places',
    'activities',
    'objects',
    'symbols',
    'flags',
] as const;
export type EmojiGroupId = (typeof EMOJI_GROUP_IDS)[u53];
export function isEmojiGroupId(key: string): key is EmojiGroupId {
    return EMOJI_GROUP_IDS.includes(key as EmojiGroupId);
}

// Emoji details.

export type SingleUnicodeEmoji = WeakOpaque<string, {readonly SingleUnicodeEmoji: unique symbol}>;
export function isSingleUnicodeEmoji(emoji: string): emoji is SingleUnicodeEmoji {
    return FULLY_QUALIFIED_UNICODE_EMOJIS.has(tag<SingleUnicodeEmoji>(emoji));
}
// Unsupported Emoji
export type UnsupportedEmoji = WeakOpaque<string, {readonly UnsupportedEmoji: unique symbol}>;

export interface EmojiDetails {
    readonly label: string;
    readonly shortcode?: string;
    readonly skins?: ReadonlyMap<SingleUnicodeEmoji, Omit<EmojiDetails, 'skins' | 'shortcode'>>;
}
export type Emojis = ReadonlyMap<SingleUnicodeEmoji, EmojiDetails>;

// Emoji and group mappings.

const VARIATION_SELECTOR_EMOJI = 'FE0F';
const VARIATION_SELECTOR_TEXT = 'FE0E';
const EMOJI_QUALIFIER_FULLY_QUALIFIED = 0;

/**
 * Mapping from `emojibase-data` hexcodes to each respective fully-qualified unicode emoji.
 */
const FULLY_QUALIFIED_EMOJI_BY_HEXCODE: ReadonlyMap<string, SingleUnicodeEmoji> = new Map(
    Object.entries(rawEmojiHexcodeData).map(([hexcode, qualifiers]) => {
        const fullyQualifiedHexcodes = Object.entries(qualifiers).flatMap(
            ([variantHex, variantQualifier]) =>
                variantQualifier === EMOJI_QUALIFIER_FULLY_QUALIFIED &&
                !variantHex.endsWith(VARIATION_SELECTOR_TEXT)
                    ? [variantHex]
                    : [],
        );
        // If there's only one fully-qualified hexcode, there's nothing more to do.
        if (fullyQualifiedHexcodes.length <= 1 && fullyQualifiedHexcodes[0] !== undefined) {
            return [hexcode, fromHexcodeToUnicodeEmoji(fullyQualifiedHexcodes[0])];
        }

        // If there are multiple fully-qualified hexcodes, expect at most two candidates; one
        // overqualified, and one fully-qualified.
        const overqualified = fullyQualifiedHexcodes.filter((variantHex) =>
            variantHex.endsWith(VARIATION_SELECTOR_EMOJI),
        );
        const qualified = fullyQualifiedHexcodes.filter(
            (variantHex) => !variantHex.endsWith(VARIATION_SELECTOR_EMOJI),
        );
        assert(
            overqualified.length === 1 && overqualified[0] !== undefined,
            `Expected to encounter one overqualified emoji, but encountered: [${overqualified.join(', ')}]`,
        );
        assert(
            qualified.length === 1 && qualified[0] !== undefined,
            `Expected to encounter one fully-qualified emoji, but encountered: [${qualified.join(', ')}]`,
        );

        return [hexcode, fromHexcodeToUnicodeEmoji(qualified[0])];
    }),
);

const FULLY_QUALIFIED_UNICODE_EMOJIS: ReadonlySet<SingleUnicodeEmoji> = new Set([
    ...FULLY_QUALIFIED_EMOJI_BY_HEXCODE.values(),
]);

/**
 * Normalize an emoji from `emojibase-data` (by its `hexcode`) to be fully-qualified, and return it
 * as a unicode string.
 *
 * @throws If no fully-qualified variant could be found in `emojibase-data`.
 */
export function qualifize(hexcode: string): SingleUnicodeEmoji {
    const fullyQualifiedVariant = FULLY_QUALIFIED_EMOJI_BY_HEXCODE.get(hexcode);
    assert(
        fullyQualifiedVariant !== undefined,
        `No fully-qualified variant found for emoji "${fromHexcodeToUnicodeEmoji(hexcode)}" (${hexcode})`,
    );

    return fullyQualifiedVariant;
}

/**
 * Converts a hexadecimal codepoint (in `string` format) to a unicode string. Adapted from:
 * https://github.com/milesj/emojibase/blob/b7a85b9ced60a2398a7c2574237d24f379fd75ca/packages/core/src/fromHexcodeToCodepoint.ts.
 *
 * ```ts
 * fromHexcodeToUnicodeEmoji('1F44B'); // 👋
 * fromHexcodeToUnicodeEmoji('1F43B-200D-2744-FE0F'); // 🐻‍❄️
 * ```
 */
function fromHexcodeToUnicodeEmoji(hexcode: string): SingleUnicodeEmoji {
    return tag<SingleUnicodeEmoji>(
        String.fromCodePoint(...hexcode.split('-').map((point) => Number.parseInt(point, 16))),
    );
}
