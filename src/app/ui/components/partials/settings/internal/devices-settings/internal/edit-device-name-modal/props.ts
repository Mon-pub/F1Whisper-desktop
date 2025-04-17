import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {u53} from '~/common/types';

export interface EditDeviceNameModalProps extends Pick<ModalProps, 'onclose'> {
    readonly maxlength?: u53;
    readonly onnewdevicename?: (newDeviceName: string) => void;
    readonly value: string;
}
