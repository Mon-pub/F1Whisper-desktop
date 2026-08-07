import {TransferTag} from '~/common/enum';
import {BaseError, type BaseErrorOptions} from '~/common/error';
import {TRANSFER_HANDLER} from '~/common/index';
import {registerErrorTransferHandler} from '~/common/utils/endpoint';

/**
 * `BackendCreationError` and its supporting type/transfer-handler live in their OWN module,
 * separate from `~/common/dom/backend` (the ~2900-line `Backend`/`LinkPreviewBackendImpl`
 * implementation file, worker-only). The renderer's main thread needs the real `BackendCreationError`
 * CLASS at runtime (`assertError(error, BackendCreationError, ...)` in `controller.ts`, an
 * `instanceof`-style check), not just its type, so `import type` cannot substitute here. Importing a
 * runtime value from the monolithic backend file would make Rollup's multi-entry code-splitting (the
 * renderer's `app` entry and the backend worker entry, under `~/worker/backend`, share one Vite
 * build) pull that whole worker-only module, including its in-function `require("node:...")` calls
 * (see `~/common/node/network/link-preview-node`), into a chunk the renderer references, exactly the
 * ship-gate violation this module exists to avoid. Keep this file free of any worker-only or
 * `node:*`-touching import.
 */

/**
 * Type of the {@link BackendCreationError}.
 *
 * - invalid-environment: Calling a feature in environments that don't support those features.
 * - invalid-oppf: An error happened during parsing the OPPF.
 * - no-identity: Identity cannot be found.
 * - handled-linking-error: An error happened during linking. The error was already propagated to
 *   the UI through the linking state, no further actions are needed.
 * - key-storage-error: An error related to the key storage occurred.
 * - key-storage-migration-error: An error related to a key storage migration occurred.
 * - fetch-oppf-error: Fetching the OPPF from the OnPrem server failed.
 * - missing-oppf-url: This is a onprem app, but no oppf url could be found in the key storage.
 * - missing-cached-onprem-config: This is an OnPrem app with Remote Secret active, but no cached
 *   OPPF could be obtained from the intermediate key storage. This happens in legacy "Gen 2" key
 *   storages where `onPremConfig` still lives inside the RS-protected inner layer, meaning we
 *   can't obtain pins to fetch the Remote Secret, and can't decrypt the inner without the Remote
 *   Secret. Recovery requires the user to delete the local profile and re-link.
 * - verify-oppf-file-error: An error happened while verifying the OPPF.
 * - update-onprem-config-error: An error happened while updating the onprem config file.
 * - update-public-key-pins-error: An error happened while updating the public key pins.
 * - onprem-configuration-error: An error related to the onprem configuration occurred.
 * - missing-work-credentials: This is a work app but no credentials could be found in the key
 *   storage.
 * - remote-secret-error: An error ocurred when activating or deactivating remote secret.
 */
export type BackendCreationErrorType =
    | 'invalid-environment'
    | 'invalid-oppf'
    | 'no-identity'
    | 'handled-linking-error'
    | 'key-storage-error'
    | 'key-storage-migration-error'
    | 'key-storage-error-wrong-password'
    | 'fetch-oppf-error'
    | 'missing-oppf-url'
    | 'missing-cached-onprem-config'
    | 'verify-oppf-file-error'
    | 'update-onprem-config-error'
    | 'update-public-key-pins-error'
    | 'missing-work-credentials'
    | 'remote-secret-error';

const BACKEND_CREATION_ERROR_TRANSFER_HANDLER = registerErrorTransferHandler<
    BackendCreationError,
    TransferTag.BACKEND_CREATION_ERROR,
    [type: BackendCreationErrorType]
>({
    tag: TransferTag.BACKEND_CREATION_ERROR,
    serialize: (error) => [error.type],
    deserialize: (message, cause, [type]) => new BackendCreationError(type, message, {from: cause}),
});

/**
 * Errors that can be thrown by the BackendCreator.
 */
export class BackendCreationError extends BaseError {
    public [TRANSFER_HANDLER] = BACKEND_CREATION_ERROR_TRANSFER_HANDLER;

    public constructor(
        public readonly type: BackendCreationErrorType,
        message: string,
        options?: BaseErrorOptions,
    ) {
        super(message, options);
    }
}
