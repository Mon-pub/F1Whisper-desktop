import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {GroupReceiverData} from '~/common/viewmodel/utils/receiver';

export interface DeleteGroupModalProps extends Pick<ModalProps, 'onclose'> {
    readonly receiver: Pick<GroupReceiverData, 'name' | 'lookup'> & {
        readonly delete: () => Promise<boolean>;
    };
}
