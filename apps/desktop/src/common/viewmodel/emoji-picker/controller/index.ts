import {TRANSFER_HANDLER} from '~/common/index';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';

export interface IEmojiPickerViewModelController extends ProxyMarked {
    /**
     * Update the skin tone preference for a given emoji.
     */
    readonly setSkinTonePreference: (
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ) => void;

    /**
     * Update the favorites using the given emoji if necessary.
     */
    readonly updateFavorites: (emoji: SingleUnicodeEmoji) => void;
}

export class EmojiPickerViewModelController implements IEmojiPickerViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public constructor(private readonly _services: ServicesForViewModel) {}

    /** @inheritdoc */
    public setSkinTonePreference(
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ): void {
        this._services.model.user.emojiPreferences
            .get()
            .controller.setSkinTonePreference(baseEmoji, preferredSkinToneEmoji);
    }

    /** @inheritdoc */
    public updateFavorites(emoji: SingleUnicodeEmoji): void {
        this._services.model.user.emojiPreferences.get().controller.updateFavorites(emoji);
    }
}
