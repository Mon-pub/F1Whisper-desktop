import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';

export interface SetAvailabilityStatusModalProps extends Pick<ModalProps, 'onclose'> {
    readonly workAvailabilityStatus: WorkAvailabilityStatus;
    readonly onsubmit: (workAvailabilityStatus: WorkAvailabilityStatus) => Promise<void>;
}
