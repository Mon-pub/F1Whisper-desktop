import type {RemoteSecretMonitorError, RemoteSecretSetupError} from '@threema/libthreema-wasm';

/**
 * Error type emitted by the `libthreema` _Remote Secret Monitor / Activate / Deactivate Steps_.
 */
export type RemoteSecretErrorType =
    | RemoteSecretMonitorError['type']
    | RemoteSecretSetupError['type']
    | 'unknown';

/**
 * Type guard for {@link RemoteSecretErrorType}.
 */
export function isRemoteSecretMonitorErrorType<
    TRemoteSecretErrorType extends RemoteSecretErrorType,
>(raw: unknown): raw is TRemoteSecretErrorType {
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
        case 'unknown':
            raw satisfies RemoteSecretErrorType;
            return true;

        default:
            return false;
    }
}

/**
 * Ensure input is a valid {@link RemoteSecretErrorType}, or maps to `"unknown"`.
 */
export function ensureRemoteSecretMonitorErrorType<
    TRemoteSecretErrorType extends RemoteSecretErrorType,
>(errorType: string): TRemoteSecretErrorType | Extract<RemoteSecretErrorType, 'unknown'> {
    if (!isRemoteSecretMonitorErrorType(errorType)) {
        return 'unknown';
    }

    return errorType as TRemoteSecretErrorType;
}
