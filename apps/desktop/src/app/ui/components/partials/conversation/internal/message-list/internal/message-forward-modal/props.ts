import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {MessageListRegularMessage} from '~/app/ui/components/partials/conversation/internal/message-list/props';
import type {DbReceiverLookup} from '~/common/db';

/**
 * Props accepted by the `MessageForwardModal` component.
 */
export interface MessageForwardModalProps extends Pick<ModalProps, 'onclose'> {
    readonly id: MessageListRegularMessage['id'];
    readonly receiverLookup: DbReceiverLookup;
    readonly services: AppServicesForSvelte;
}
