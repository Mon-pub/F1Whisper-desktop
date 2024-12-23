import type {Model} from '~/common/model/types/common';
import type {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';
import type {ProxyMarked} from '~/common/utils/endpoint';

export interface EmojiPreferencesView {
    readonly skinTonePreferences: Map<SingleUnicodeEmoji, SingleUnicodeEmoji>;
}

export type EmojiPreferencesController = {
    readonly lifetimeGuard: ModelLifetimeGuard<EmojiPreferencesView>;

    /**
     * Set an emoji skin tone preference.
     *
     * The `baseEmoji` is the default (yellow) color emoji while the `preferredSkinToneEmoji` is an
     * emoji with a skin tone preference belonging to the same group. Note: The
     * `preferredSkinToneEmoji` is allowed to be equal to the `baseEmoji`. It is the responsibility
     * of the caller to ensure that the `baseEmoji` is a baseEmoji and matches the
     * `preferredSkinToneEmoji`.
     *
     */
    readonly setSkinTonePreference: (
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ) => void;
} & ProxyMarked;

export type EmojiPreferences = Model<EmojiPreferencesView, EmojiPreferencesController>;
