import type {EmojiGroupId} from '~/common/utils/emoji';
import type {Remote} from '~/common/utils/endpoint';
import type {EmojiPickerViewModelBundle} from '~/common/viewmodel/emoji-picker';

/**
 * Type of the value contained in a `EmojiPickerViewModelBundle` transferred from {@link Remote}.
 */
export type RemoteEmojiPickerViewModelStoreValue = ReturnType<
    Remote<EmojiPickerViewModelBundle>['viewModelStore']['get']
>;

export type EmojiGroupIdOrFavorites = EmojiGroupId | 'favorites';
