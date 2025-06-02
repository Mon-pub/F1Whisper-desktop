import type {AppServicesForSvelte} from '~/app/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {RegularMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/props';

/**
 * Props accepted by the `Props` component.
 */
export interface PollProps {
    readonly pollData: Exclude<MessageProps['pollData'], undefined>;
    readonly receiver: RegularMessageProps['conversation']['receiver'];
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}

export type ModalState = NoneModalState | ViewVotesModalState | ClosePollModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface ViewVotesModalState {
    readonly type: 'view-votes';
}

interface ClosePollModalState {
    readonly type: 'close-poll';
}
