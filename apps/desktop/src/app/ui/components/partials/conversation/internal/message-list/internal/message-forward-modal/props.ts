import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {MessageListRegularMessage} from '~/app/ui/components/partials/conversation/internal/message-list/props';
import type {DbReceiverLookup} from '~/common/db';

/**
 * Forward an existing message to the selected receivers.
 */
interface ForwardMessageContent {
    readonly type: 'forward-message';
    readonly id: MessageListRegularMessage['id'];
    readonly receiverLookup: DbReceiverLookup;
}

/**
 * Share an arbitrary piece of text (e.g. a conference invite URL) to the selected receivers by
 * sending it as a new text message.
 */
interface ShareTextContent {
    readonly type: 'share-text';
    readonly text: string;
}

/**
 * Props accepted by the `MessageForwardModal` component.
 */
export interface MessageForwardModalProps extends Pick<ModalProps, 'onclose'> {
    /**
     * What should be sent to the receivers selected in the modal.
     */
    readonly content: ForwardMessageContent | ShareTextContent;
    readonly services: AppServicesForSvelte;
}
