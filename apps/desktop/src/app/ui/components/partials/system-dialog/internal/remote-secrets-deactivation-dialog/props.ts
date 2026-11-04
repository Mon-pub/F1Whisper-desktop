import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {AppServicesForSvelte} from '~/app/types';
import type {
    RemoteSecretsDeactivationDialogContext,
    SystemDialogAction,
} from '~/common/system-dialog';

export interface RemoteSecretsDeactivationDialogProps
    extends RemoteSecretsDeactivationDialogContext {
    /**
     * Optional callback to call when a choice is made, e.g. a button was clicked.
     */
    readonly onselectaction?: (action: SystemDialogAction) => void;
    readonly services: Delayed<Pick<AppServicesForSvelte, 'backend' | 'electron'>>;
}
