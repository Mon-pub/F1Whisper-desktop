import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {ServerAlertDialogContext, SystemDialogAction} from '~/common/system-dialog';
/**
 * Props accepted by the `ServerAlertDialog` component.
 */
export interface ServerAlertDialogProps
    extends Pick<ModalProps, 'onclose'>,
        ServerAlertDialogContext {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
