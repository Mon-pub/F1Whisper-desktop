import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';
import {
    EmojiPickerViewModelController,
    type IEmojiPickerViewModelController,
} from '~/common/viewmodel/emoji-picker/controller';
import {
    getEmojiPickerViewModelStore,
    type EmojiPickerViewModelStore,
} from '~/common/viewmodel/emoji-picker/store';

export interface EmojiPickerViewModelBundle extends PropertiesMarked {
    readonly viewModelController: IEmojiPickerViewModelController;
    readonly viewModelStore: EmojiPickerViewModelStore;
}

export function getEmojiPickerViewModelBundle(
    services: ServicesForViewModel,
): EmojiPickerViewModelBundle {
    const viewModelController = new EmojiPickerViewModelController(services);
    const viewModelStore = getEmojiPickerViewModelStore(services);

    return services.endpoint.exposeProperties({
        viewModelController,
        viewModelStore,
    });
}
