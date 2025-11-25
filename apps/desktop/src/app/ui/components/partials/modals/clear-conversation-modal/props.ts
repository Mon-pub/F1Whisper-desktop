import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {u53} from '~/common/types';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `ClearConversationModal` component.
 */
export interface ClearConversationModalProps extends Pick<ModalProps, 'onclose'> {
    readonly conversation: {
        readonly clear: () => Promise<void>;
        readonly totalMessagesCount: u53;
    };
    readonly receiver: Pick<AnyReceiverData, 'name' | 'type'>;
}
