import type {AppServicesForSvelte} from '~/app/types';
import type {SystemDialogAction} from '~/common/system-dialog';
import type {Delayed} from '~/common/utils/delayed';

export interface RemoteSecretsDeactivationDialogProps {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly previouslyAttemptedPassword?: string;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
