import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {DisbandGroupIntent} from '~/common/model/types/group';
import type {GroupReceiverData} from '~/common/viewmodel/utils/receiver';

export interface DisbandGroupModalProps extends Pick<ModalProps, 'onclose'> {
    readonly services: Pick<AppServicesForSvelte, 'router'>;
    readonly intent: DisbandGroupIntent;
    readonly receiver: Pick<GroupReceiverData, 'name'> & {
        readonly disband: () => Promise<boolean>;
    };
}
