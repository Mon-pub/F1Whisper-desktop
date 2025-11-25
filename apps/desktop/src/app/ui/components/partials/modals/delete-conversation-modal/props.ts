import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {
    ContactReceiverData,
    DistributionListReceiverData,
    GroupReceiverData,
} from '~/common/viewmodel/utils/receiver';

export interface DeleteConversationModalProps extends Pick<ModalProps, 'onclose'> {
    readonly conversation: {
        readonly delete: () => Promise<void>;
    };
    readonly onafterdeleteconversation?: (
        lookup: DeleteConversationModalProps['receiver']['lookup'],
    ) => void;
    readonly receiver:
        | Pick<ContactReceiverData, 'name' | 'type' | 'lookup'>
        | Pick<DistributionListReceiverData, 'name' | 'type' | 'lookup'>
        | Pick<GroupReceiverData, 'name' | 'type' | 'lookup' | 'isLeft'>;
}
