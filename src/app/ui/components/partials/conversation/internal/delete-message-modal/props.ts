import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {
    AnyMessageListMessageStore,
    MessageListRegularMessage,
} from '~/app/ui/components/partials/conversation/internal/message-list/props';
import type {IQueryableStoreValue} from '~/common/utils/store';
import type {FeatureSupport} from '~/common/viewmodel/conversation/main/store/types';

export interface DeleteMessageModalProps extends Pick<ModalProps, 'onclose'> {
    readonly featureSupport: FeatureSupport;
    readonly message: IQueryableStoreValue<AnyMessageListMessageStore>;
    readonly onclickdeleteforeveryone?: (message: MessageListRegularMessage) => void;
    readonly onclickdeletelocally?: (
        message: IQueryableStoreValue<AnyMessageListMessageStore>,
    ) => void;
    /**
     * If set to false, delete for everyone is explicitly turned off. Defaults to true.
     */
    readonly showDeleteForEveryoneButton: boolean;
}
