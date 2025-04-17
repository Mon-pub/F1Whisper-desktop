import type {AppServicesForSvelte} from '~/app/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `Props` component.
 */
export interface PollProps {
    readonly pollData: Exclude<MessageProps['pollData'], undefined>;
    readonly receiver: AnyReceiverData;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}

export type ModalState = NoneModalState | ViewVotesModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface ViewVotesModalState {
    readonly type: 'view-votes';
}
