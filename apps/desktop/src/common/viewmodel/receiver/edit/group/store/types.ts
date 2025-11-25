import type {Contact} from '~/common/model';
import type {ReceiverListItemSetStore} from '~/common/viewmodel/receiver/list/store/types';
import type {GroupReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Data to be supplied to the UI layer as part of the `ViewModelStore`. This should be as close as
 * possible to the `EditGroupMembersModalProps` that the edit group members modal component, excluding props
 * that only exist in the ui layer.
 */
export interface GroupEditViewModel {
    readonly contactListItemSetStore: ReceiverListItemSetStore<Contact>;
    readonly groupReceiverData: GroupReceiverData;
}
