import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

import type {ClearConversationModalProps} from '~/app/ui/components/partials/modals/clear-conversation-modal/props';
import type {DeleteConversationModalProps} from '~/app/ui/components/partials/modals/delete-conversation-modal/props';
import type {DeleteGroupModalProps} from '~/app/ui/components/partials/modals/delete-group-modal/props';
import type {ManageFoldersModalProps} from '~/app/ui/components/partials/modals/manage-folders-modal/props';
import type {SetAvailabilityStatusModalProps} from '~/app/ui/components/partials/modals/set-availability-status-modal/props';
import type {u64} from '~/common/types';
import type {Remote} from '~/common/utils/endpoint';
import type {ConversationListViewModelBundle} from '~/common/viewmodel/conversation/list';
import type {ConversationListItemViewModelBundle} from '~/common/viewmodel/conversation/list/item';

/**
 * Type of the value contained in a `ConversationListViewModelStore` transferred from {@link Remote}.
 */
export type RemoteConversationListViewModelStoreValue = ReturnType<
    Remote<ConversationListViewModelBundle>['viewModelStore']['get']
>;

/**
 * Branded type for a list item.
 */
export type ConversationPreviewListId = WeakOpaque<
    u64,
    {readonly ConversationPreviewListId: unique symbol}
>;

/**
 * Type of the props passed to each context menu item's handler callback.
 */
export interface ContextMenuItemHandlerProps {
    readonly viewModelBundle: Remote<ConversationListItemViewModelBundle>;
}

export type ModalState =
    | NoneModalState
    | ClearConversationModalState
    | DeleteConversationModalState
    | DeleteGroupModalState
    | ManageFoldersModalState
    | SetAvailabilityStatusModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface ClearConversationModalState {
    readonly type: 'clear-conversation';
    readonly props: ClearConversationModalProps;
}

interface DeleteConversationModalState {
    readonly type: 'delete-conversation';
    readonly props: DeleteConversationModalProps;
}

interface DeleteGroupModalState {
    readonly type: 'delete-group';
    readonly props: DeleteGroupModalProps;
}

/** F1Whisper fork: manage desktop-local chat folders. */
interface ManageFoldersModalState {
    readonly type: 'manage-folders';
    readonly props: ManageFoldersModalProps;
}

interface SetAvailabilityStatusModalState {
    readonly type: 'set-availability-status';
    readonly props: SetAvailabilityStatusModalProps;
}
