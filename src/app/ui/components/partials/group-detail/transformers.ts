import type {
    ContextMenuItemHandlerProps,
    RemoteGroupDetailViewModelStoreValue,
} from '~/app/ui/components/partials/group-detail/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {u53} from '~/common/types';
import type {IQueryableStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';

/**
 * Transforms the `groupDetailViewModelStore to a new store compatible with the shape of the item props expected
 * by `GroupContent` component.
 */
export function groupReceiverDataToGroupContentItemProps(
    groupDetailViewModelStore: IQueryableStore<RemoteGroupDetailViewModelStoreValue | undefined>,
): IQueryableStore<ReceiverPreviewListProps<ContextMenuItemHandlerProps>['items']> {
    return derive([groupDetailViewModelStore], ([{currentValue: groupDetailViewModel}]) => {
        if (groupDetailViewModel === undefined) {
            return [];
        }
        // Get the creator props, so we can add it to the list.
        const creator: ReceiverPreviewListProps['items'] = [
            {
                handlerProps: undefined,
                interaction:
                    groupDetailViewModel.receiver.creator.type === 'self'
                        ? {mode: 'none'}
                        : {
                              mode: 'click',
                          },
                receiver: {
                    ...groupDetailViewModel.receiver.creator,
                    isCreator: true,
                },
            },
        ];

        const sortedMembers = groupDetailViewModel.receiver.members.sort((a, b) => {
            // Always sort `self` to the end
            if (a.type === 'self') {
                return 1;
            }
            if (b.type === 'self') {
                return -1;
            }
            return a.name.localeCompare(b.name);
        });

        // In groups where the current handleProps are shown, the user is the creator and cannot be
        // in the `sortedMembers` list. However, we handle the case anyway, in case we add
        // non-creator related functionality to the context menu in the future (e.g. edit-contact)
        // which cannot be applied to the user.
        return [
            ...creator,
            ...sortedMembers.map(
                (receiver) =>
                    ({
                        handlerProps: receiver.type === 'self' ? undefined : {receiver},
                        interaction: {
                            mode: 'click',
                        },
                        receiver,
                    }) satisfies ReceiverPreviewListProps<ContextMenuItemHandlerProps>['items'][u53],
            ),
        ];
    });
}
