import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {RegularMessageProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/props';

/**
 * Props accepted by the `MessageMediaViewerModal` component.
 */
export interface MessageMediaViewerModalProps extends Pick<ModalProps, 'onclose'> {
    readonly file: Omit<NonNullable<RegularMessageProps['file']>, 'type'> & {
        readonly type: 'image' | 'video';
    };
}
