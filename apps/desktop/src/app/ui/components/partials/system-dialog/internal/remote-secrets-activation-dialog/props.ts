import type {AppServicesForSvelte} from '~/app/types';
import type {
    RemoteSecretsActivationDialogContext,
    SystemDialogAction,
} from '~/common/system-dialog';
import type {Delayed} from '~/common/utils/delayed';

export interface RemoteSecretsActivationDialogProps extends RemoteSecretsActivationDialogContext {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
