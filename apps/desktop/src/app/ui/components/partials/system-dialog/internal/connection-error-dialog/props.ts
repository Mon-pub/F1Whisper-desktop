import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {ConnectionErrorDialogContext, SystemDialogAction} from '~/common/system-dialog';
/**
 * Props accepted by the `ConnectionErrorDialog` component.
 */
export interface ConnectionErrorDialogProps
    extends Pick<ModalProps, 'onclose'>,
        ConnectionErrorDialogContext {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
