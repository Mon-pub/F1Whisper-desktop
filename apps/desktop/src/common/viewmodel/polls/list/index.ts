import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';
import {
    getPollListViewModelStore,
    type PollListViewModelStore,
} from '~/common/viewmodel/polls/list/store';

export interface PollListViewModelBundle extends PropertiesMarked {
    readonly viewModelStore: PollListViewModelStore;
}

export function getPollListViewModelBundle(
    services: Pick<ServicesForViewModel, 'device' | 'endpoint' | 'model'>,
): PollListViewModelBundle {
    const {endpoint} = services;

    const viewModelStore = getPollListViewModelStore(services);

    return endpoint.exposeProperties({
        viewModelStore,
    });
}
