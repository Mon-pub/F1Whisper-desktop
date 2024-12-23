import type RawEmojis from 'emojibase-data/en/data.json';
import type ShortcodesDataset from 'emojibase-data/en/shortcodes/cldr.json';
import rawEmojiGroupData from 'emojibase-data/meta/groups.json' assert {type: 'json'};

import {i18n} from '~/app/ui/i18n';
import type {ServicesForBackend} from '~/common/backend';
import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import {group} from '~/common/utils/array';
import {assert} from '~/common/utils/assert';
import {
    type EmojiGroupId,
    type Emojis,
    isEmojiGroupId,
    type EmojiDetails,
    type SingleUnicodeEmoji,
    fromHexcodeToUnicodeEmoji,
    FULLY_QUALIFIED_EMOJI_BY_HEXCODE,
} from '~/common/utils/emoji';
import type {IQueryableStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';

// When new locales are added, this should be updated if the locale is supported by `EmojiBase`.
const SUPPORTED_EMOJI_LOCALES = ['de', 'en'] as const;

const EMOJI_GROUP_NONE = 'none';

/**
 * This class contains a store that holds the dynamic emoji data. This data is dependent on the user
 * locale. If the locale cannot be loaded, the standard `en` emoji data is loaded.
 */
export class EmojiService {
    private readonly _emojiByGroupStore: IQueryableStore<
        Promise<ReadonlyMap<EmojiGroupId, Emojis>>
    >;
    private readonly _log: Logger;

    public constructor(private readonly _services: Pick<ServicesForBackend, 'logging'>) {
        this._log = this._services.logging.logger('emojis.service');

        this._emojiByGroupStore = derive([i18n], async ([{currentValue: i18nStore}]) => {
            const {locale} = i18nStore;

            if (SUPPORTED_EMOJI_LOCALES.includes(locale)) {
                try {
                    // For the raw emoji data including the label, always read the english default
                    // set.
                    const rawEmojiData = await import(
                        `../../../../node_modules/emojibase-data/en/data.json`
                    ).then((json: {default: typeof RawEmojis}) => json.default);

                    const rawEmojiShortcodes = await import(
                        `../../../../node_modules/emojibase-data/${locale}/shortcodes/cldr.json`
                    ).then((json: {readonly default: typeof ShortcodesDataset}) => json.default);

                    const rawNativeShortcodes = await import(
                        `../../../../node_modules/emojibase-data/${locale}/shortcodes/cldr-native.json`
                    ).then((json: {readonly default: typeof ShortcodesDataset}) => json.default);

                    return getEmojisByGroup(rawEmojiData, {
                        ...rawEmojiShortcodes,
                        ...rawNativeShortcodes,
                    });
                } catch (error: unknown) {
                    this._log.warn('Failed to load emoji data, falling back to default:', error);
                }
            }

            const rawEmojiData = await import(
                '../../../../node_modules/emojibase-data/en/data.json'
            ).then((json: {default: typeof RawEmojis}) => json.default);

            const rawEmojiShortcodes = await import(
                '../../../../node_modules/emojibase-data/en/shortcodes/cldr.json'
            ).then((json: {readonly default: typeof ShortcodesDataset}) => json.default);
            return getEmojisByGroup(rawEmojiData, rawEmojiShortcodes);
        });
    }

    /**
     * Get the current emoji data of the current locale.
     *
     * The asynchronity comes from the dynamic imports of the emoji-data.
     */
    public async getEmojisByGroup(): Promise<ReadonlyMap<EmojiGroupId, Emojis>> {
        return await this._emojiByGroupStore.get();
    }
}

function getEmojisByGroup(
    rawEmojiData: typeof RawEmojis,
    rawEmojiShortcodes: typeof ShortcodesDataset,
): ReadonlyMap<EmojiGroupId, Emojis> {
    return new Map(
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
                        emojis.sort(sortByOrder).map(({hexcode, label, skins}) => {
                            const shortcodes = rawEmojiShortcodes[hexcode];
                            let shortcode: string | undefined;
                            if (typeof shortcodes === 'string' || shortcodes === undefined) {
                                shortcode = shortcodes;
                            } else {
                                shortcode = shortcodes[0];
                            }

                            return [
                                qualifize(hexcode),
                                {
                                    shortcode,
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
                            ] as const;
                        }),
                    ),
                ],
            ];
        }),
    );
}

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

function sortByOrder(a: {readonly order?: u53}, b: {readonly order?: u53}): u53 {
    if (a.order === undefined) {
        return -1;
    }
    if (b.order === undefined) {
        return 1;
    }
    return a.order - b.order;
}
