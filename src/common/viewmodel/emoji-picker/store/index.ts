import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {LocalStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import type {ServicesForViewModel} from '~/common/viewmodel';
import type {EmojiPickerViewModel} from '~/common/viewmodel/emoji-picker/store/types';

export type EmojiPickerViewModelStore = LocalStore<EmojiPickerViewModel & PropertiesMarked>;

export function getEmojiPickerViewModelStore(
    services: Pick<ServicesForViewModel, 'endpoint' | 'model'>,
): EmojiPickerViewModelStore {
    const {endpoint, model} = services;
    const emojiPreferences = model.user.emojiPreferences;

    return derive([emojiPreferences], ([{currentValue: newValue}]) =>
        endpoint.exposeProperties({
            skinTonePreferences: newValue.view.skinTonePreferences,
        }),
    );
}
