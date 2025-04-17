import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {
    AnyMessageListMessage,
    MessageListRegularMessage,
} from '~/app/ui/components/partials/conversation/internal/message-list/props';
import type {FeatureSupport} from '~/common/viewmodel/conversation/main/store/types';

export interface DeleteMessageModalProps extends Pick<ModalProps, 'onclose'> {
    readonly featureSupport: FeatureSupport;
    readonly message: AnyMessageListMessage;
    readonly onclickdeleteforeveryone?: (message: MessageListRegularMessage) => void;
    readonly onclickdeletelocally?: (message: AnyMessageListMessage) => void;
    /**
     * If set to false, delete for everyone is explicitly turned off. Defaults to true.
     */
    readonly showDeleteForEveryoneButton: boolean;
}
