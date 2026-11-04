import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {SystemDialogAction} from '~/common/system-dialog';
/**
 * Props accepted by the `UnrecoverableStateDialog` component.
 */
export interface UnrecoverableStateDialogProps extends Pick<ModalProps, 'onclose'> {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
