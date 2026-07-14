import {assert} from '~/common/utils/assert';
import type {PropertiesMarked} from '~/common/utils/endpoint';
import type {LocalStore} from '~/common/utils/store';
import {derive} from '~/common/utils/store/derived-store';
import {LocalSetStore} from '~/common/utils/store/set-store';
import type {ServicesForViewModel} from '~/common/viewmodel';
import type {PollItemData, PollListViewModel} from '~/common/viewmodel/polls/list/store/types';
import {getContactReceiverData} from '~/common/viewmodel/utils/receiver';

export type PollListViewModelStore = LocalStore<PollListViewModel & PropertiesMarked>;

export function getPollListViewModelStore(
    services: Pick<ServicesForViewModel, 'device' | 'endpoint' | 'model'>,
): PollListViewModelStore {
    const {endpoint} = services;
    const polls = services.model.messages.getAllPolls();
    return derive([polls], ([{currentValue: pollList}], getAndSubscribe) => {
        const transformedPolls = new Set(
            [...pollList].map((poll): PollItemData => {
                let receiverData;
                if (poll.pollCreatorIdentity !== services.device.identity.string) {
                    const contact = services.model.contacts.getByIdentity(poll.pollCreatorIdentity);
                    assert(contact !== undefined);
                    receiverData = {
                        type: 'contact',
                        name: getContactReceiverData(
                            services,
                            getAndSubscribe(contact),
                            getAndSubscribe,
                        ).name,
                    } as const;
                } else {
                    receiverData = {
                        type: 'self',
                    } as const;
                }
                return {
                    announceType: poll.announceType,
                    answerType: poll.answerType,
                    choices: poll.choices,
                    createdAt: poll.createdAt,
                    description: poll.description,
                    displayMode: poll.displayMode,
                    id: `${poll.conversationUid}.${poll.pollId}`,
                    creator: receiverData,
                };
            }),
        );

        return endpoint.exposeProperties({polls: new LocalSetStore(transformedPolls)});
    });
}
