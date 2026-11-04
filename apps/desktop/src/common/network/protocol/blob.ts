import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import type {u53} from '@threema/ts-utils/integer/u53';
import {ensureError} from '@threema/ts-utils/meta/ensure-error';
import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

import {
    type EncryptedData,
    NACL_CONSTANTS,
    type Nonce,
    NONCE_UNGUARDED_SCOPE,
    type PlainData,
} from '~/common/crypto';
import {CREATE_BUFFER_TOKEN} from '~/common/crypto/box';
import {ReceiverType, TransferTag} from '~/common/enum';
import {BaseError, type BaseErrorOptions, extractErrorMessage} from '~/common/error';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {AnyReceiver} from '~/common/model';
import type {ServicesForTasks} from '~/common/network/protocol/task';
import {type RawBlobKey, wrapRawBlobKey} from '~/common/network/types/keys';
import {registerErrorTransferHandler} from '~/common/utils/endpoint';
import {isNotesGroup} from '~/common/utils/group';

/**
 * Byte length of a Threema Blob ID.
 */
export const BLOB_ID_LENGTH = 16;

/**
 * A blob ID (16 bytes).
 */
export type BlobId = WeakOpaque<ReadonlyUint8Array, {readonly BlobId: unique symbol}>;

/**
 * Type guard for {@link BlobId}.
 */
export function isBlobId(id: unknown): id is BlobId {
    return id instanceof Uint8Array && id.byteLength === BLOB_ID_LENGTH;
}

/**
 * Ensure input is a valid {@link BlobId}.
 */
export function ensureBlobId(id: Uint8Array): BlobId {
    if (!isBlobId(id)) {
        throw new Error(
            `Expected Blob ID to be ${BLOB_ID_LENGTH} bytes but has ${id.byteLength} bytes`,
        );
    }
    return id;
}

/**
 * A blob ID (16 bytes) as hex string.
 */
export type BlobIdString = WeakOpaque<string, {readonly BlobIdString: unique symbol}>;

/**
 * Convert a bytes-based {@link BlobId} to a string-based {@link BlobIdString}3
 */
export function blobIdToString(blobId: BlobId): BlobIdString {
    return bytesToHex(blobId) as BlobIdString;
}

/**
 * The scope of a Blob API call.
 *
 * When uploading:
 *
 * - `local`: The blob will only be available on the local blob mirror and will be removed from the
 *   blob mirror once all devices have marked the blob as 'done'.
 * - `public`: Like `local` but the blob will also be available on the public blob server for
 *    everyone. It will be removed from the public blob server once **anyone** has marked it as
 *    'done' there.
 *
 * When downloading:
 *
 * - `local`: The blob will only be looked up on the local blob mirror. If the blob isn't found
 *   there, a "not found" response will be returned.
 * - `public`: In this case, the blob will first be looked up on the local blob mirror, followed by
 *   the public blob server.
 *
 * When marking a blob as 'done':
 *
 * - `local`: Once all devices marked the blob as 'done', it will be removed from the blob mirror.
 * - `public`: Like `local` but the blob will also be removed on the public blob server.
 *
 * In practice, this means that...
 *
 * ...when uploading:
 *
 * - When uploading a blob for reflection, use `local`.
 * - When uploading a blob for an outgoing CSP message, use `public`.
 *
 * ...when downloading:
 *
 * - When downloading a blob for an incoming message from another Threema user, always use `public`
 *   for the download.
 * - When downloading a blob for a reflected message that is only relevant inside the device group
 *   (e.g. when syncing the user's own profile picture), use `local` for the download.
 *
 * ...when marking a download as done:
 *
 * - When a blob as part of a reflected message has been downloaded, use `local` to mark it as
 *   'done'.
 * - When downloading a blob for an incoming CSP message as part of a 1:1 conversation, use `public`
 *   to mark it as 'done'.
 * - When downloading a blob for an incoming CSP message as part of a group conversation, use
 *   `local` to mark it as 'done' on the blob mirror in order to prevent removing it on the public
 *   blob server for other group participants.
 */
export type BlobScope = 'local' | 'public';

/**
 * The internal scope of a blob upload.
 *
 * Depending of `BlobScope` and persistency, the possible values are as follows:
 *
 * - `local`: used to upload a blob for reflection. Local blobs are never marked as persistent. This
 *   scope is also used for notes groups.
 * - `public-persistent`: used to upload a persistent blob for an outgoing CSP message.
 * - `public-volatile`: used to upload a non-persistent blob for an outgoing CSP message.
 **/
export type BlobUploadScope = 'local' | 'public-persistent' | 'public-volatile';

/**
 * Determine the upload scope for a given receiver.
 */
export function getBlobUploadScope(receiver: AnyReceiver): BlobUploadScope {
    if (receiver.type === ReceiverType.CONTACT) {
        return 'public-volatile';
    }
    if (receiver.type === ReceiverType.GROUP && isNotesGroup(receiver)) {
        return 'local';
    }
    return 'public-persistent';
}

/**
 * Downloaded blob result.
 */
export interface BlobDownloadResult {
    /**
     * The blob's data.
     */
    readonly data: EncryptedData;

    /**
     * Mark a blob as 'done' (i.e. eligible for removal once all devices have downloaded the blob).
     *
     * This should be called as soon as possible once the blob's data has been stored and is
     * idempotent, i.e. may be called multiple times.
     *
     * @throws {BlobBackendError} if marking blob as done fails.
     */
    readonly done: (scope: BlobScope) => Promise<void>;
}

/**
 * Blob API backend.
 */
export interface BlobBackend {
    /**
     * Upload a blob and set the persistance flag.
     *
     * F1Whisper fork: the optional `options.signal` cancels the request. A cancelled upload rejects
     * with a {@link BlobBackendError} of type `aborted`.
     *
     * @throws {BlobBackendError} if uploading the blob fails.
     */
    upload: (
        blobUploadScope: BlobUploadScope,
        data: EncryptedData,
        options?: BlobUploadOptions,
    ) => Promise<BlobId>;

    /**
     * Download a blob.
     *
     * @throws {BlobBackendError} if downloading the blob fails.
     */
    download: (scope: BlobScope, id: BlobId) => Promise<BlobDownloadResult>;
}

/**
 * F1Whisper fork: options of {@link BlobBackend.upload}.
 */
export interface BlobUploadOptions {
    /**
     * Cancels the upload request when aborted.
     */
    readonly signal?: AbortSignal;
}

/**
 * Type of the {@link BlobBackendError}.
 *
 * - fetch: An error occurred when downloading data from or uploading data to the server.
 * - not-found: The blob mirror returned 404 for this blob.
 * - invalid-blob-id: Blob ID returned on upload is invalid.
 * - aborted: F1Whisper fork: the upload was cancelled on purpose (see {@link BlobUploadOptions}).
 *   This is not a transport failure and must not be retried.
 */
export type BlobBackendErrorType = 'fetch' | 'not-found' | 'invalid-blob-id' | 'aborted';

const BLOB_BACKEND_ERROR_TRANSFER_HANDLER = registerErrorTransferHandler<
    BlobBackendError,
    TransferTag.BLOB_BACKEND_ERROR,
    [
        type: BlobBackendErrorType,
        status: u53 | undefined,
        body: string | undefined,
        responded: boolean,
    ]
>({
    tag: TransferTag.BLOB_BACKEND_ERROR,
    serialize: (error) => [error.type, error.status, error.body, error.responded],
    deserialize: (message, cause, [type, status, body, responded]) =>
        new BlobBackendError(type, message, {from: cause, status, body, responded}),
});

/**
 * F1Whisper fork: options of a {@link BlobBackendError}.
 */
export interface BlobBackendErrorOptions extends BaseErrorOptions {
    /** HTTP status of the server's refusal, if the server answered at all. */
    readonly status?: u53 | undefined;
    /** Start of the server's response body for a refusal (a short plain-text reason). */
    readonly body?: string | undefined;
    /**
     * Whether a server ANSWERED (with any HTTP status, or with an answer that could not be used,
     * e.g. a malformed blob id or a refused token). `false` for transport failures where no answer
     * arrived: offline, DNS, connection refused or reset, TLS, our own safety time cap.
     * Defaults to `true` if a {@link status} is given and to `false` otherwise.
     */
    readonly responded?: boolean | undefined;
}

/**
 * Errors related to working with the blob mirror.
 */
export class BlobBackendError extends BaseError {
    /** F1Whisper fork: HTTP status of the server's refusal (`undefined` for transport failures). */
    public readonly status: u53 | undefined;
    /** F1Whisper fork: short plain-text reason the server gave for a refusal, if any. */
    public readonly body: string | undefined;
    /**
     * F1Whisper fork: whether a server answered (see {@link BlobBackendErrorOptions.responded}).
     * The retry policy only spends its budget on failures where a server answered; a message that
     * cannot be uploaded because the device is offline keeps waiting, like text messages do.
     */
    public readonly responded: boolean;

    public [TRANSFER_HANDLER] = BLOB_BACKEND_ERROR_TRANSFER_HANDLER;

    public constructor(
        public readonly type: BlobBackendErrorType,
        message: string,
        options?: BlobBackendErrorOptions,
    ) {
        super(message, options);
        this.status = options?.status;
        this.body = options?.body;
        this.responded = options?.responded ?? options?.status !== undefined;
    }
}

/**
 * Download the blob, decrypt its bytes and mark it as downloaded.
 *
 * @throws {BlobBackendError} if downloading the blob fails.
 * @throws {CryptoError} if decryption fails.
 */
export async function downloadAndDecryptBlob(
    services: Pick<ServicesForTasks, 'blob' | 'crypto'>,
    log: Logger,
    id: BlobId,
    key: RawBlobKey,
    nonce: Nonce,
    downloadScope: BlobScope,
    doneScope: BlobScope,
): Promise<ReadonlyUint8Array> {
    const {blob, crypto} = services;

    // Download
    const result = await blob.download(downloadScope, id);

    // Decrypt blob bytes
    const box = crypto.getSecretBox(key, NONCE_UNGUARDED_SCOPE, undefined);
    const decrypted = box
        .decryptorWithNonce(CREATE_BUFFER_TOKEN, nonce, result.data)
        .decrypt(undefined).plainData;

    // Mark as downloaded in the background
    // TODO(DESK-921): Do this *after* processing!
    result
        .done(doneScope)
        .catch((error: unknown) =>
            log.warn(
                `Failed to mark blob as done: ${extractErrorMessage(ensureError(error), 'short')}`,
            ),
        );

    // Return decrypted bytes
    return decrypted;
}

export interface BlobInfo {
    readonly id: BlobId;
    readonly key: RawBlobKey;
    readonly nonce: Nonce;
}

/**
 * Encrypt the blob with a given key and upload the encrypted bytes.
 *
 * @throws {BlobBackendError} if uploading the blob fails.
 * @throws {CryptoError} if encryption fails.
 */
export async function encryptAndUploadBlobWithEncryptionKey(
    services: Pick<ServicesForTasks, 'blob' | 'crypto'>,
    bytes: ReadonlyUint8Array,
    nonce: Nonce,
    key: RawBlobKey,
    uploadScope: BlobUploadScope,
    // F1Whisper fork: optional upload options (cancellation).
    options?: BlobUploadOptions,
): Promise<BlobInfo> {
    const {blob, crypto} = services;

    // Encrypt blob bytes
    const box = crypto.getSecretBox(key, NONCE_UNGUARDED_SCOPE, undefined);
    const encryptedBytes = box
        .encryptor(CREATE_BUFFER_TOKEN, bytes as PlainData)
        .encryptWithDangerousUnguardedNonce(nonce);

    // Upload encrypted data
    const blobId = await blob.upload(uploadScope, encryptedBytes, options);

    // Return blob info
    return {
        id: blobId,
        key,
        nonce,
    };
}

/**
 * Encrypt the blob with a random key and upload the encrypted bytes.
 *
 * @throws {BlobBackendError} if uploading the blob fails.
 * @throws {CryptoError} if encryption fails.
 */
export async function encryptAndUploadBlob(
    services: Pick<ServicesForTasks, 'blob' | 'crypto'>,
    bytes: ReadonlyUint8Array,
    nonce: Nonce,
    uploadScope: BlobUploadScope,
): Promise<BlobInfo> {
    const randomKey = wrapRawBlobKey(
        services.crypto.randomBytes(new Uint8Array(NACL_CONSTANTS.KEY_LENGTH)),
    );
    return await encryptAndUploadBlobWithEncryptionKey(
        services,
        bytes,
        nonce,
        randomKey,
        uploadScope,
    );
}
