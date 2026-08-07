import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

/**
 * Props accepted by the `SafeBackupModal` component (F1Whisper fork, FU-M12).
 */
export interface SafeBackupModalProps extends Pick<ModalProps, 'onclose'> {
    readonly services: AppServicesForSvelte;
}
