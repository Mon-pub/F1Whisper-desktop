import type * as v from '@badrap/valita';

import type {ROUTE_DEFINITIONS} from '~/app/routing/routes';
import type {Remote} from '~/common/utils/endpoint';
import type {GroupEditViewModelBundle} from '~/common/viewmodel/receiver/edit/group';

/**
 * Shape of the router's route params if it's a modal route.
 */
export type EditGroupMembersRouteParams = v.Infer<
    (typeof ROUTE_DEFINITIONS)['modal']['editGroupMembers']['params']
>;

/**
 * Type of the value contained in a `EditGroupViewModelStore` transferred from {@link Remote}.
 */
export type RemoteGroupEditViewModelStoreValue = ReturnType<
    Remote<GroupEditViewModelBundle>['viewModelStore']['get']
>;

/**
 * Type of the `GroupEditViewModelController` transferred from {@link Remote}.
 */
export type RemoteGroupEditViewModelController =
    Remote<GroupEditViewModelBundle>['viewModelController'];
