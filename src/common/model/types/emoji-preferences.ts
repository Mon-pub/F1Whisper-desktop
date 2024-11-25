import type {Model} from '~/common/model/types/common';
import type {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import type {EmojiGroupId, SingleUnicodeEmoji} from '~/common/utils/emoji';
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
     * `preferredSkinToneEmoji` is allowed to be equal to the `baseEmoji`.
     *
     * @throws if `baseEmoji` and `preferredSkinToneEmoji` don't belong to the same group of emoji,
     * i.e., they not only differ in skin tone.
     */
    readonly setSkinTonePreference: (
        groupId: EmojiGroupId,
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ) => void;
} & ProxyMarked;

export type EmojiPreferences = Model<EmojiPreferencesView, EmojiPreferencesController>;
