import type {
    ContextMenuItemHandlerProps,
    RemoteReceiverListViewModelStoreValue,
} from '~/app/ui/components/partials/receiver-nav/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {AnyReceiver} from '~/common/model';
import type {PropertiesMarked, PropertiesMarkedRemote, Remote} from '~/common/utils/endpoint';
import type {IQueryableStore} from '~/common/utils/store';
import {derive, type GetAndSubscribeFunction} from '~/common/utils/store/derived-store';
import type {ReceiverListItemViewModelBundle} from '~/common/viewmodel/receiver/list/item';
import type {ReceiverListViewModel} from '~/common/viewmodel/receiver/list/store/types';

/**
 * Transforms the `ReceiverListViewModelStore` to a new store containing all receivers
 * (sorted) that can be displayed.
 */
export function receiverListViewModelStoreToReceiverPreviewListItemsStore(
    receiverListViewModelStore: IQueryableStore<RemoteReceiverListViewModelStoreValue | undefined>,
): IQueryableStore<
    ReceiverPreviewListProps<ContextMenuItemHandlerProps<AnyReceiver>>['items'] | undefined
> {
    return derive(
        [receiverListViewModelStore],
        ([{currentValue: receiverListViewModel}], getAndSubscribe) =>
            getSortedReceiverItems(receiverListViewModel, getAndSubscribe),
    );
}

function getSortedReceiverItems(
    receiverListViewModel:
        | PropertiesMarkedRemote<ReceiverListViewModel & PropertiesMarked>
        | undefined,
    getAndSubscribe: GetAndSubscribeFunction,
): ReceiverPreviewListProps<ContextMenuItemHandlerProps<AnyReceiver>>['items'] | undefined {
    let receiverListItems: Remote<ReceiverListItemViewModelBundle<AnyReceiver>>[] = [];

    const contactListItemSetStore = receiverListViewModel?.contactListItemSetStore;
    if (contactListItemSetStore === undefined) {
        return undefined;
    }

    const groupListItemSetStore = receiverListViewModel?.groupListItemSetStore;
    if (groupListItemSetStore === undefined) {
        return undefined;
    }

    // TODO(DESK-236): Subscribe to distribution lists.

    // Cast is necessary here, as TypeScript is not able to infer that `Contact` and `Group` are
    // both subtypes of `AnyReceiver`.
    receiverListItems = [
        ...getAndSubscribe(contactListItemSetStore),
        ...getAndSubscribe(groupListItemSetStore),
    ] as Remote<ReceiverListItemViewModelBundle<AnyReceiver>>[];

    return receiverListItems
        .map((viewModelBundle) => ({
            handlerProps: {viewModelBundle},
            receiver: getAndSubscribe(viewModelBundle.viewModelStore).receiver,
        }))
        .sort((a, b) => a.receiver.name.localeCompare(b.receiver.name));
}
