import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {LeaveGroupIntent} from '~/common/model/types/group';
import type {GroupReceiverData} from '~/common/viewmodel/utils/receiver';

export interface LeaveGroupModalProps extends Pick<ModalProps, 'onclose'> {
    readonly intent: LeaveGroupIntent;
    readonly receiver: Pick<GroupReceiverData, 'name'> & {
        readonly leave: () => Promise<boolean>;
    };
    readonly services: Pick<AppServicesForSvelte, 'router'>;
}
