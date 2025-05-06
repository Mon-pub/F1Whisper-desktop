import type {ProfilePictureService} from '~/common/dom/ui/profile-picture';
import type {PollData} from '~/common/viewmodel/conversation/main/message/regular-message/store/types';
import type {AnyReceiverData, SelfReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `PollVotesListModal` component.
 */
export interface PollVotesListModalProps {
    readonly description: string;
    readonly choices: PollData['choices'];
    readonly receiver: AnyReceiverData;
    readonly selfReceiverData: SelfReceiverData;
    readonly profilePictureService: ProfilePictureService;
}
