import type {u53} from '@threema/ts-utils/integer/u53';

import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface EditDeviceNameModalProps extends Pick<ModalProps, 'onclose'> {
    readonly maxlength?: u53;
    readonly onnewdevicename?: (newDeviceName: string) => void;
    readonly value: string;
}
