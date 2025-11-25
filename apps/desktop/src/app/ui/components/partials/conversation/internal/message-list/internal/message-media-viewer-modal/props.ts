import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {MessageListRegularMessage} from '~/app/ui/components/partials/conversation/internal/message-list/props';

/**
 * Props accepted by the `MessageMediaViewerModal` component.
 */
export interface MessageMediaViewerModalProps extends Pick<ModalProps, 'onclose'> {
    readonly file: Omit<NonNullable<MessageListRegularMessage['file']>, 'type'> & {
        readonly type: 'image' | 'video';
    };
}
