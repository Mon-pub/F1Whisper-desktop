import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {PollData} from '~/common/viewmodel/conversation/main/message/regular-message/store/types';
import type {AnyReceiverData, SelfReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `PollVotesListModal` component.
 */
export interface PollVotesListModalProps extends Pick<ModalProps, 'onclose'> {
    readonly choices: PollData['choices'];
    readonly description: string;
    readonly receiver: AnyReceiverData;
    readonly selfReceiverData: SelfReceiverData;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}
