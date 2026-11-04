import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {IViewModelRepository, ServicesForViewModel} from '~/common/viewmodel';
import {
    ConversationListViewModelController,
    type IConversationListViewModelController,
} from '~/common/viewmodel/conversation/list/controller';
import {
    getConversationListViewModelStore,
    type ConversationListViewModelStore,
} from '~/common/viewmodel/conversation/list/store';

export interface ConversationListViewModelBundle extends PropertiesMarked {
    readonly viewModelController: IConversationListViewModelController;
    readonly viewModelStore: ConversationListViewModelStore;
}

export function getConversationListViewModelBundle(
    services: ServicesForViewModel,
    viewModelRepository: IViewModelRepository,
): ConversationListViewModelBundle {
    const {endpoint} = services;

    const viewModelController = new ConversationListViewModelController(services);

    const viewModelStore = getConversationListViewModelStore(services, viewModelRepository);

    return endpoint.exposeProperties({
        viewModelController,
        viewModelStore,
    });
}
