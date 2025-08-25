import type {RemoteSecretMonitorError, RemoteSecretSetupError} from 'libthreema';

/**
 * Error type emitted by the `libthreema` _Remote Secret Monitor / Activate / Deactivate Steps_.
 */
export type RemoteSecretErrorType =
    | RemoteSecretMonitorError['type']
    | RemoteSecretSetupError['type'];

/**
 * Type guard for {@link RemoteSecretErrorType}.
 */
export function isRemoteSecretMonitorErrorType<
    TRemoteSecretMonitorErrorType extends RemoteSecretErrorType,
>(raw: unknown): raw is TRemoteSecretMonitorErrorType {
    switch (raw) {
        case 'invalid-state':
        case 'server-error':
        case 'timeout':
        case 'not-found':
        case 'blocked':
        case 'mismatch':
        case 'network-error':
        case 'rate-limit-exceeded':
        case 'invalid-credentials':
            raw satisfies RemoteSecretErrorType;
            return true;

        default:
            return false;
    }
}

/**
 * Ensure input is a valid {@link RemoteSecretErrorType}.
 *
 * @throws If the given string is not a valid `RemoteSecretErrorType`.
 */
export function ensureRemoteSecretMonitorErrorType<
    TRemoteSecretMonitorErrorType extends RemoteSecretErrorType,
>(errorType: string): TRemoteSecretMonitorErrorType {
    if (!isRemoteSecretMonitorErrorType(errorType)) {
        throw new Error(
            `The given error type ${errorType} is not a valid remote secret monitor error type`,
        );
    }
    return errorType as TRemoteSecretMonitorErrorType;
}
