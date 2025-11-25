import type {Remote} from '~/common/utils/endpoint';
import type {PollListViewModelBundle} from '~/common/viewmodel/polls/list';

export type RemotePollListViewModelBundle = ReturnType<
    Remote<PollListViewModelBundle>['viewModelStore']['get']
>;

/**
 * Type of the value contained in a `PollListViewModelStore` transferred from {@link Remote}.
 */
export type RemotePollListViewModelStoreValue = ReturnType<
    Remote<PollListViewModelBundle>['viewModelStore']['get']
>;
