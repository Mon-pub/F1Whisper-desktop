import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface RelinkDeviceModalProps extends Pick<ModalProps, 'onclose'> {
    readonly services: AppServicesForSvelte;
}
