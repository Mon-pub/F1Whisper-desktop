import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {
    MessageListRegularMessage,
    MessageListStatusMessage,
} from '~/app/ui/components/partials/conversation/internal/message-list/props';
import type {SanitizedHtml} from '~/app/ui/utils/text';
import type {MessageId, StatusMessageId} from '~/common/network/types';

/**
 * Props accepted by the `MessageDetailsModal` component.
 */
export interface MessageDetailsModalProps extends Pick<ModalProps, 'onclose'> {
    readonly direction?: MessageListRegularMessage['direction'];
    readonly file?: MessageListRegularMessage['file'];
    readonly id?: MessageId | StatusMessageId;
    readonly history: readonly HistoryEntry[];
    readonly services: AppServicesForSvelte;
    readonly status: MessageListRegularMessage['status'];
    readonly statusMessageType?: MessageListStatusMessage['status']['type'];
}

interface HistoryEntry {
    readonly at: Date;
    // Sanitized html of the history's text. Is undefined if the history entry describes an empty caption.
    readonly text: SanitizedHtml | undefined;
}
