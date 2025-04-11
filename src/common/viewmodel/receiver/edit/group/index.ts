import type {Group} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {IViewModelRepository, ServicesForViewModel} from '~/common/viewmodel';
import {
    GroupEditViewModelController,
    type IEditGroupViewModelCotnroller as IGroupEditViewModelCotnroller,
} from '~/common/viewmodel/receiver/edit/group/controller';
import {
    getGroupEditViewModelStore,
    type GroupEditViewModelStore,
} from '~/common/viewmodel/receiver/edit/group/store';

export interface GroupEditViewModelBundle extends PropertiesMarked {
    readonly viewModelController: IGroupEditViewModelCotnroller;
    readonly viewModelStore: GroupEditViewModelStore;
}

export function getGroupEditViewModelBundle(
    services: Pick<ServicesForViewModel, 'device' | 'endpoint' | 'logging' | 'model'>,
    groupModelStore: ModelStore<Group>,
    viewModelRepository: IViewModelRepository,
): GroupEditViewModelBundle {
    const {endpoint} = services;

    const viewModelController = new GroupEditViewModelController(services, groupModelStore.get());
    const viewModelStore = getGroupEditViewModelStore(
        services,
        groupModelStore,
        viewModelRepository,
    );

    return endpoint.exposeProperties({
        viewModelController,
        viewModelStore,
    });
}
