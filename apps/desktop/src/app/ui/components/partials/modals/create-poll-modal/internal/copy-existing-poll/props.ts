import type {PollItemData} from '~/common/viewmodel/polls/list/store/types';

export interface CopyExistingPollProps {
    readonly onclickexistingpoll: (item: PollItemData) => void;
    readonly pollItemList: readonly PollItemData[];
}
