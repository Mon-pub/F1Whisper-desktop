import type {Group} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {LocalStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import type {IViewModelRepository, ServicesForViewModel} from '~/common/viewmodel';
import type {GroupEditViewModel} from '~/common/viewmodel/receiver/edit/group/store/types';
import {getContactListItemSetStore} from '~/common/viewmodel/receiver/list/store/helpers';
import {getReceiverData} from '~/common/viewmodel/utils/receiver';

export type GroupEditViewModelStore = LocalStore<GroupEditViewModel & PropertiesMarked>;

export function getGroupEditViewModelStore(
    services: Pick<ServicesForViewModel, 'device' | 'endpoint' | 'logging' | 'model'>,
    groupModelStore: ModelStore<Group>,
    viewModelRepository: IViewModelRepository,
): GroupEditViewModelStore {
    const {endpoint} = services;

    return derive([groupModelStore], ([{currentValue: groupModel}], getAndSubscribe) => {
        const editGroupViewModel: GroupEditViewModel = {
            contactListItemSetStore: getContactListItemSetStore(services, viewModelRepository),
            groupReceiverData: getReceiverData(services, groupModel, getAndSubscribe),
        };

        return endpoint.exposeProperties({
            ...editGroupViewModel,
        });
    });
}
