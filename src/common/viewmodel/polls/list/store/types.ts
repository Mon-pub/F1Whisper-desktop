import type {PartialPollMessageViewSnapshot} from '~/common/model/types/message/poll';
import type {LocalSetStore} from '~/common/utils/store/set-store';

/**
 * Data to be supplied to the UI layer as part of the `ViewModelStore`. This should be as close as
 * possible to the `PollList` that the `CreatePollModal` expects, excluding props
 * that only exist in the ui layer.
 */
export interface PollListViewModel {
    readonly polls: LocalSetStore<PollItemData>;
}

export type PollItemData = Omit<
    PartialPollMessageViewSnapshot,
    'conversationUid' | 'pollId' | 'pollCreatorIdentity' | 'pollMessageType'
> & {
    readonly creator:
        | {
              readonly type: 'contact';
              readonly name: string;
          }
        | {readonly type: 'self'};
    readonly id: `${string}.${string}`;
};
