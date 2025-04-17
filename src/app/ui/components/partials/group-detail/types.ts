import type * as v from '@badrap/valita';

import type {ROUTE_DEFINITIONS} from '~/app/routing/routes';
import type {EditGroupNameModalProps} from '~/app/ui/components/partials/modals/edit-group-name-modal/props';
import type {ProfilePictureModalProps} from '~/app/ui/components/partials/modals/profile-picture-modal/props';
import type {Remote} from '~/common/utils/endpoint';
import type {GroupDetailViewModelBundle} from '~/common/viewmodel/receiver/detail/group';
import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

/**
 * Shape of the router's route params if it's an "aside" route.
 */
export type GroupDetailRouteParams = v.Infer<
    (typeof ROUTE_DEFINITIONS)['aside']['groupDetails']['params']
>;

export type RemoteGroupDetailViewModelStoreValue = ReturnType<
    Remote<GroupDetailViewModelBundle>['viewModelStore']['get']
>;

export type RemoteGroupDetailViewModelController =
    Remote<GroupDetailViewModelBundle>['viewModelController'];

export type ModalState = NoneModalState | ProfilePictureModalState | EditGroupNameModalState;

export type ContextMenuItemHandlerProps =
    | {
          readonly receiver: AnyReceiverDataOrSelf;
      }
    | undefined;

interface NoneModalState {
    readonly type: 'none';
}

interface ProfilePictureModalState {
    readonly type: 'profile-picture';
    readonly props: ProfilePictureModalProps;
}

interface EditGroupNameModalState {
    readonly type: 'edit-group-name';
    readonly props: EditGroupNameModalProps;
}
