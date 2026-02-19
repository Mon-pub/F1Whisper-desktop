import type {BackendCreationError, CertificatePinRecoveryHandle} from '~/common/dom/backend';
import type {Delayed} from '~/common/utils/delayed';
import type {RemoteProxy} from '~/common/utils/endpoint';

export interface InvalidCertificatePinsDialogProps {
    /**
     * Recovery handle that provides access to certificate pin recovery in the backend worker
     */
    readonly recoveryHandle: Delayed<RemoteProxy<CertificatePinRecoveryHandle>>;

    /**
     * Previously attempted password (if any)
     */
    readonly previouslyAttemptedPassword: string | undefined;

    /**
     * Local app password obtained either from the safeStorage or the first password request.
     */
    readonly requestedPassword: string;

    /**
     * `BackendCreationError` to display in the error details.
     */
    readonly backendCreationError?: BackendCreationError;
}
