import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface ForgotPasswordModalProps {
    readonly onclose?: ModalProps['onclose'];
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
}
