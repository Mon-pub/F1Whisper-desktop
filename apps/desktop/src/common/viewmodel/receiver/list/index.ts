import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {IViewModelRepository, ServicesForViewModel} from '~/common/viewmodel';
import {
    ReceiverListViewModelController,
    type IReceiverListViewModelController,
} from '~/common/viewmodel/receiver/list/controller';
import {
    getReceiverListViewModelStore,
    type ReceiverListViewModelStore,
} from '~/common/viewmodel/receiver/list/store';

export interface ReceiverListViewModelBundle extends PropertiesMarked {
    readonly viewModelStore: ReceiverListViewModelStore;
    readonly viewModelController: IReceiverListViewModelController;
}

export function getReceiverListViewModelBundle(
    services: ServicesForViewModel,
    viewModelRepository: IViewModelRepository,
): ReceiverListViewModelBundle {
    const {endpoint} = services;

    const viewModelStore = getReceiverListViewModelStore(services, viewModelRepository);
    const viewModelController = new ReceiverListViewModelController(services);

    return endpoint.exposeProperties({
        viewModelStore,
        viewModelController,
    });
}
