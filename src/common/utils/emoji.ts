import rawEmojiData from 'emojibase-data/en/data.json' assert {type: 'json'};
import rawEmojiGroupData from 'emojibase-data/meta/groups.json' assert {type: 'json'};
import rawEmojiHexcodeData from 'emojibase-data/meta/hexcodes.json' assert {type: 'json'};

import {tag, type u53, type WeakOpaque} from '~/common/types';
import {group} from '~/common/utils/array';
import {assert} from '~/common/utils/assert';

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
interface EmojiDetails {
    readonly label: string;
    readonly skins?: ReadonlyMap<SingleUnicodeEmoji, Omit<EmojiDetails, 'skins'>>;
}
type Emojis = ReadonlyMap<SingleUnicodeEmoji, EmojiDetails>;

// Emoji and group mappings.

const VARIATION_SELECTOR_EMOJI = 'FE0F';
const VARIATION_SELECTOR_TEXT = 'FE0E';
const EMOJI_QUALIFIER_FULLY_QUALIFIED = 0;
const EMOJI_GROUP_NONE = 'none';

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

/**
 * The full `emojibase-data` emoji set, grouped by group id.
 */
export const EMOJIS_BY_GROUP: ReadonlyMap<EmojiGroupId, Emojis> = new Map(
    Array.from(
        group<EmojiGroupId | typeof EMOJI_GROUP_NONE, (typeof rawEmojiData)[u53]>(
            rawEmojiData,
            ({group: groupId}) => {
                if (groupId === undefined) {
                    return EMOJI_GROUP_NONE;
                }

                const groupKey = rawEmojiGroupData.groups[groupId] ?? EMOJI_GROUP_NONE;
                if (isEmojiGroupId(groupKey)) {
                    return groupKey;
                }

                return EMOJI_GROUP_NONE;
            },
        ).entries(),
    ).flatMap(([key, emojis]) => {
        // Remove ungrouped emoji.
        if (key === EMOJI_GROUP_NONE) {
            return [];
        }

        // Map emoji data of each group to our own type `EmojiDetails`.
        return [
            [
                key,
                new Map<SingleUnicodeEmoji, EmojiDetails>(
                    emojis.sort(sortByOrder).map(
                        ({hexcode, label, skins}) =>
                            [
                                qualifize(hexcode),
                                {
                                    label,
                                    skins:
                                        skins === undefined
                                            ? undefined
                                            : new Map(
                                                  skins.sort(sortByOrder).map((skin) => [
                                                      qualifize(skin.hexcode),
                                                      {
                                                          label: skin.label,
                                                      },
                                                  ]),
                                              ),
                                },
                            ] as const,
                    ),
                ),
            ],
        ];
    }),
);

/**
 * Normalize an emoji from `emojibase-data` (by its `hexcode`) to be fully-qualified, and return it
 * as a unicode string.
 *
 * @throws If no fully-qualified variant could be found in `emojibase-data`.
 */
function qualifize(hexcode: string): SingleUnicodeEmoji {
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

function sortByOrder(a: {readonly order?: u53}, b: {readonly order?: u53}): u53 {
    if (a.order === undefined) {
        return -1;
    }
    if (b.order === undefined) {
        return 1;
    }
    return a.order - b.order;
}
