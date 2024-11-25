import {TRANSFER_HANDLER} from '~/common/index';
import type {EmojiGroupId, SingleUnicodeEmoji} from '~/common/utils/emoji';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';

export interface IEmojiPickerViewModelController extends ProxyMarked {
    /**
     * Update the skin tone preference for a given emoji.
     */
    readonly setSkinTonePreference: (
        groupId: EmojiGroupId,
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ) => void;
}

export class EmojiPickerViewModelController implements IEmojiPickerViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public constructor(private readonly _services: ServicesForViewModel) {}

    /** @inheritdoc */
    public setSkinTonePreference(
        groupId: EmojiGroupId,
        baseEmoji: SingleUnicodeEmoji,
        preferredSkinToneEmoji: SingleUnicodeEmoji,
    ): void {
        this._services.model.user.emojiPreferences
            .get()
            .controller.setSkinTonePreference(groupId, baseEmoji, preferredSkinToneEmoji);
    }
}
