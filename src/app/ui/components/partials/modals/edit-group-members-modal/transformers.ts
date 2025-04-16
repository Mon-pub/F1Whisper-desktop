import type {RemoteGroupEditViewModelStoreValue} from '~/app/ui/components/partials/modals/edit-group-members-modal/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import {InactiveContactsPolicy} from '~/common/enum';
import type {AppearanceSettingsView} from '~/common/model/types/settings';
import type {PropertiesMarked, PropertiesMarkedRemote} from '~/common/utils/endpoint';
import type {IQueryableStore} from '~/common/utils/store';
import {derive, type GetAndSubscribeFunction} from '~/common/utils/store/derived-store';
import type {GroupEditViewModel} from '~/common/viewmodel/receiver/edit/group/store/types';

/**
 * Transforms the `GroupEditViewModelStore` to a new store containing all contacts that should be
 * displayed according to the settings.
 */
export function groupEditViewModelStoreToContactList(
    groupEditViewModelstore: IQueryableStore<RemoteGroupEditViewModelStoreValue | undefined>,
    appearanceSettings: AppearanceSettingsView,
): IQueryableStore<ReceiverPreviewListProps['items'] | undefined> {
    return derive(
        [groupEditViewModelstore],
        ([{currentValue: groupEditViewModel}], getAndSubscribe) =>
            getSortedContactItems(groupEditViewModel, getAndSubscribe, appearanceSettings),
    );
}

function getSortedContactItems(
    receiverListViewModel:
        | PropertiesMarkedRemote<GroupEditViewModel & PropertiesMarked>
        | undefined,
    getAndSubscribe: GetAndSubscribeFunction,
    appearanceSettings: AppearanceSettingsView,
): ReceiverPreviewListProps['items'] | undefined {
    const contactListItemSetStore = receiverListViewModel?.contactListItemSetStore;
    if (contactListItemSetStore === undefined) {
        return undefined;
    }
    return [...getAndSubscribe(contactListItemSetStore)]
        .map((viewModelBundle) => ({
            handlerProps: undefined,
            receiver: getAndSubscribe(viewModelBundle.viewModelStore).receiver,
        }))
        .filter(
            (item) =>
                item.receiver.acquaintanceLevel === 'direct' &&
                !(
                    appearanceSettings.inactiveContactsPolicy === InactiveContactsPolicy.HIDE &&
                    item.receiver.isInactive
                ) &&
                // Invalid contacts cannot be added to groups.
                !item.receiver.isInvalid,
        )
        .sort((a, b) => a.receiver.name.localeCompare(b.receiver.name));
}
