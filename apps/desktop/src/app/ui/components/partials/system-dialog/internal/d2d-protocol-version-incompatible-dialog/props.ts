import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';

export interface D2DProtocolVersionIncompatibleDialogProps extends Pick<ModalProps, 'onclose'> {
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
