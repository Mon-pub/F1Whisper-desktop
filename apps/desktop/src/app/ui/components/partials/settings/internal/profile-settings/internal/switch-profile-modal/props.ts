import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface SwitchProfileModalProps extends Pick<ModalProps, 'onclose'> {
    readonly services: AppServicesForSvelte;
}
