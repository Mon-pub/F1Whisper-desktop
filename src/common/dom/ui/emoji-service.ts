import type RawEmojis from 'emojibase-data/en/data.json';
import type ShortcodesDataset from 'emojibase-data/en/shortcodes/cldr.json';
import rawEmojiGroupData from 'emojibase-data/meta/groups.json' assert {type: 'json'};

import {i18n, type I18n} from '~/app/ui/i18n';
import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import {group} from '~/common/utils/array';
import {
    type EmojiGroupId,
    type Emojis,
    isEmojiGroupId,
    type EmojiDetails,
    type SingleUnicodeEmoji,
    qualifize,
} from '~/common/utils/emoji';
import {AsyncLock} from '~/common/utils/lock';
import {WritableStore, type IQueryableStore, type IWritableStore} from '~/common/utils/store';

// When new locales are added, this should be updated if the locale is supported by `EmojiBase`.
const SUPPORTED_EMOJI_LOCALES = ['de', 'en'] as const;

const EMOJI_GROUP_NONE = 'none';

/**
 * This class contains a store that holds the dynamic emoji data. This data is dependent on the user
 * locale. If the locale cannot be loaded, the standard `en` emoji data is loaded.
 */
export class EmojiService {
    private readonly _lock = new AsyncLock();
    private readonly _emojiByGroupStore: IWritableStore<ReadonlyMap<EmojiGroupId, Emojis>> =
        new WritableStore<ReadonlyMap<EmojiGroupId, Emojis>>(new Map());

    public constructor(private readonly _log: Logger) {
        i18n.subscribe(({locale}) => {
            this._updateEmojiByGroupStore(locale);
        });
    }

    /**
     * Get a store containing the grouped emoji data of the current locale.
     */
    public getEmojisByGroupStore(): IQueryableStore<ReadonlyMap<EmojiGroupId, Emojis>> {
        return this._emojiByGroupStore;
    }

    private _updateEmojiByGroupStore(locale: I18n['locale']): void {
        this._lock
            .with(async () => {
                if (SUPPORTED_EMOJI_LOCALES.includes(locale)) {
                    try {
                        // For the raw emoji data including the label, always read the english default
                        // set.
                        const rawEmojiData = await import(
                            `../../../../node_modules/emojibase-data/en/data.json`
                        ).then((json: {default: typeof RawEmojis}) => json.default);

                        const rawEmojiShortcodes = await import(
                            `../../../../node_modules/emojibase-data/${locale}/shortcodes/cldr.json`
                        ).then(
                            (json: {readonly default: typeof ShortcodesDataset}) => json.default,
                        );

                        const rawNativeShortcodes = await import(
                            `../../../../node_modules/emojibase-data/${locale}/shortcodes/cldr-native.json`
                        ).then(
                            (json: {readonly default: typeof ShortcodesDataset}) => json.default,
                        );

                        this._emojiByGroupStore.set(
                            getEmojisByGroup(rawEmojiData, {
                                ...rawEmojiShortcodes,
                                ...rawNativeShortcodes,
                            }),
                        );
                        return;
                    } catch (error: unknown) {
                        this._log.warn(
                            'Failed to load emoji data, falling back to default:',
                            error,
                        );
                    }
                }

                const rawEmojiData = await import(
                    '../../../../node_modules/emojibase-data/en/data.json'
                ).then((json: {default: typeof RawEmojis}) => json.default);

                const rawEmojiShortcodes = await import(
                    '../../../../node_modules/emojibase-data/en/shortcodes/cldr.json'
                ).then((json: {readonly default: typeof ShortcodesDataset}) => json.default);

                this._emojiByGroupStore.set(getEmojisByGroup(rawEmojiData, rawEmojiShortcodes));
            })
            .catch((error: unknown) => {
                this._log.error(`Error updating store: ${error}`);
            });
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

function sortByOrder(a: {readonly order?: u53}, b: {readonly order?: u53}): u53 {
    if (a.order === undefined) {
        return -1;
    }
    if (b.order === undefined) {
        return 1;
    }
    return a.order - b.order;
}
