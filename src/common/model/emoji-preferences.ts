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

export function deserializeSkinTonePreferences(
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
}

export class EmojiPreferencesModelStore extends ModelStore<EmojiPreferences> {
    public constructor(services: ServicesForModel) {
        const {logging} = services;
        const tag = 'emoji-preferences';
        const stored = services.db.getPreferredEmojiSkinTones();
        super(
            {skinTonePreferences: deserializeSkinTonePreferences(stored)},
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
