import type {SystemDialogAction} from '~/common/system-dialog';

export interface RemoteSecretsSystemSuspendDialogProps {
    readonly onselectaction?: (action: SystemDialogAction) => void;
}
