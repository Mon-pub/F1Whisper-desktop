import type {CopyExistingPollProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/copy-existing-poll/props';
import type {RemotePollListViewModelStoreValue} from '~/app/ui/components/partials/modals/create-poll-modal/types';
import type {IQueryableStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';

/**
 * Transforms the `PollListViewModelStore` to a new store containing all polls
 * (sorted by date) that can be displayed.
 */
export function pollListViewModelStoreToReceiverPreviewListItemsStore(
    pollListViewModelStore: IQueryableStore<RemotePollListViewModelStoreValue | undefined>,
): IQueryableStore<CopyExistingPollProps['pollItemList'] | undefined> {
    return derive(
        [pollListViewModelStore],
        ([{currentValue: pollListViewModel}], getAndSubscribe) => {
            if (pollListViewModel === undefined) {
                return [];
            }
            const pollListItems = [...getAndSubscribe(pollListViewModel.polls)];
            return pollListItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        },
    );
}
