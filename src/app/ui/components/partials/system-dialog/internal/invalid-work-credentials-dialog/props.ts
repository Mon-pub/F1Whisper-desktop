import type {AppServicesForSvelte} from '~/app/types';
import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {InvalidWorkCredentialsDialogContext, SystemDialogAction} from '~/common/system-dialog';
import type {Delayed} from '~/common/utils/delayed';

/**
 * Props accepted by the `InvalidWorkCredentialsDialog` component.
 */
export interface InvalidWorkCredentialsDialogProps
    extends Pick<ModalProps, 'onclose'>,
        InvalidWorkCredentialsDialogContext {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
