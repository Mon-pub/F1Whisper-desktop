import type {Contact} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {LocalStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import type {ServicesForViewModel} from '~/common/viewmodel';
import type {ContactDetailViewModel} from '~/common/viewmodel/receiver/detail/contact/store/types';
import {getReceiverData, getSelfReceiverData} from '~/common/viewmodel/utils/receiver';

export type ContactDetailViewModelStore = LocalStore<ContactDetailViewModel & PropertiesMarked>;

export function getContactDetailViewModelStore(
    services: Pick<ServicesForViewModel, 'device' | 'endpoint' | 'logging' | 'model'>,
    contactModelStore: ModelStore<Contact>,
): ContactDetailViewModelStore {
    const {endpoint} = services;

    return derive([contactModelStore], ([{currentValue: contactModel}], getAndSubscribe) => {
        const contactDetailViewModel: ContactDetailViewModel = {
            receiver: getReceiverData(services, contactModel, getAndSubscribe),
            user: getSelfReceiverData(services, getAndSubscribe),
        };

        return endpoint.exposeProperties({
            ...contactDetailViewModel,
        });
    });
}
