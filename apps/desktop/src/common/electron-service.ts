import type {RemoteSecretErrorType} from '~/common/remote-secret';
import type {DomainCertificatePin} from '~/common/types';
import type {ProxyMarked} from '~/common/utils/endpoint';

/**
 * Exposes functions that require communication with the electron main thread through the electron IPC.
 *
 * Lives in the frontend thread.
 */
export interface IFrontendElectronService extends ProxyMarked {
    /**
     * Forwards domain certificate pins to the main thread to register them in the current session.
     */
    readonly updatePublicKeyPins: (newPins: DomainCertificatePin[] | undefined) => void;
    /**
     * Remove all old profiles from the file system.
     */
    readonly removeOldProfiles: () => void;
    /**
     * Restart the app and install an update.
     */
    readonly restartAppAndInstallUpdate: () => void;
    /**
     * Restart the app.
     */
    readonly restartApp: () => void;
    /**
     * Return the {@link RemoteSecretErrorType} the app was launched with, if any.
     */
    readonly getRemoteSecretLaunchParameter: () => RemoteSecretErrorType | undefined;
    /**
     * Restart the app with the given {@link RemoteSecretErrorType} as the reason.
     */
    readonly remoteSecretErrorRestartApp: (errorType: RemoteSecretErrorType) => void;
    /**
     * Restart the app because of a system suspension when remote secret is active.
     */
    readonly remoteSecretSystemSuspensionRestartApp: () => void;
    /**
     * Whether or not the app was started due to a system suspense when remote secret is active.
     */
    readonly remoteSecretSystemSuspensionRestartParameter: () => boolean;
}
