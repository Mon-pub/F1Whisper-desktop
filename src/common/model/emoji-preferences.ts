import type {DbEmojiSkinTone, DbList} from '~/common/db';
import {TRANSFER_HANDLER} from '~/common/index';
import type {ServicesForModel} from '~/common/model/types/common';
import type {
    EmojiPreferences,
    EmojiPreferencesController,
    EmojiPreferencesView,
} from '~/common/model/types/emoji-preferences';
import {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import {ModelStore} from '~/common/model/utils/model-store';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

// The max number of preferred emojis that are displayed.
const MAX_PREFERRED_EMOJIS = 3 * 8;
export type FavoriteEmojisSortModes = 'most-recent' | 'most-used';
const FAVORITE_EMOJIS_SORT_MODE: FavoriteEmojisSortModes = 'most-used';

function deserializeSkinTonePreferences(
    preferences: DbList<DbEmojiSkinTone, 'baseEmoji' | 'preferredSkinToneEmoji'>,
): Map<SingleUnicodeEmoji, SingleUnicodeEmoji> {
    const preferredSkinToneMap = new Map<SingleUnicodeEmoji, SingleUnicodeEmoji>();

    for (const skinTonePreference of preferences) {
        preferredSkinToneMap.set(
            skinTonePreference.baseEmoji,
            skinTonePreference.preferredSkinToneEmoji,
        );
    }

    return preferredSkinToneMap;
}

export class EmojiPreferencesModelController implements EmojiPreferencesController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    public readonly lifetimeGuard = new ModelLifetimeGuard<EmojiPreferencesView>();

    public constructor(private readonly _services: ServicesForModel) {}

    /** @inheritdoc */
    public setSkinTonePreference(
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ): void {
        this.lifetimeGuard.update((view) => {
            this._services.db.setPreferredSkinToneEmoji(baseEmoji, preferredSkinToneEmoji);
            const skinTonePreferences = new Map([...view.skinTonePreferences]);
            skinTonePreferences.set(baseEmoji, preferredSkinToneEmoji);
            return {skinTonePreferences};
        });
    }

    /** @inheritdoc */
    public updateFavorites(emoji: SingleUnicodeEmoji): void {
        this.lifetimeGuard.update(() => {
            this._services.db.addOrIncreaseEmojiUsageCount(emoji);
            // Let the database do the sorting for us.
            const preferredEmojis = this._services.db.getSortedFavoriteEmojis(
                FAVORITE_EMOJIS_SORT_MODE,
                MAX_PREFERRED_EMOJIS,
            );
            return {sortedFavorites: preferredEmojis};
        });
    }
}

export class EmojiPreferencesModelStore extends ModelStore<EmojiPreferences> {
    public constructor(services: ServicesForModel) {
        const {logging} = services;
        const tag = 'emoji-preferences';
        const storedSkinTonePreferrences = services.db.getPreferredEmojiSkinTones();
        const storedMostRecentEmojis = services.db.getSortedFavoriteEmojis(
            FAVORITE_EMOJIS_SORT_MODE,
            MAX_PREFERRED_EMOJIS,
        );
        super(
            {
                skinTonePreferences: deserializeSkinTonePreferences(storedSkinTonePreferrences),
                sortedFavorites: storedMostRecentEmojis,
            },
            new EmojiPreferencesModelController(services),
            undefined,
            undefined,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}
