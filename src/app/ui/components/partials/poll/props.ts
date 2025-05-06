import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {ProfilePictureService} from '~/common/dom/ui/profile-picture';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `Props` component.
 */
export interface PollProps {
    readonly pollData: Exclude<MessageProps['pollData'], undefined>;
    readonly receiver: AnyReceiverData;
    readonly profilePictureService: ProfilePictureService;
}

export type ModalState = NoneModalState | ViewVotesModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface ViewVotesModalState {
    readonly type: 'view-votes';
}
