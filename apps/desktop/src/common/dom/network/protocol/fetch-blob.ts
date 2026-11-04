import {ensureArrayBufferBackedView} from '@threema/ts-utils/byte/array-buffer-backed-view';
import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import {hexToBytes} from '@threema/ts-utils/byte/hex-to-bytes';
import {u64ToHexLe} from '@threema/ts-utils/number/u64-to-hex-le';

import type {ServicesForBackend} from '~/common/backend';
import type {EncryptedData, PublicKey} from '~/common/crypto';
import {
    type BlobBackend,
    BlobBackendError,
    type BlobDownloadResult,
    type BlobId,
    type BlobScope,
    isBlobId,
    blobIdToString,
    type BlobUploadOptions,
    type BlobUploadScope,
} from '~/common/network/protocol/blob';
import {type DirectoryBackend, DirectoryError} from '~/common/network/protocol/directory';
import {UPLOAD_MAX_DURATION_MS} from '~/common/network/protocol/f1-blob-upload-coordinator';
import {unreachable} from '~/common/utils/assert';

type ServicesForBlobBackend = Pick<ServicesForBackend, 'config' | 'device' | 'directory'>;

/** Longest part of a refusal body that is kept. The server's reasons are a few words. */
const MAX_REFUSAL_BODY_CHARS = 200;

/**
 * Read the start of the plain-text reason a server gave for refusing a request. Never throws.
 */
async function readRefusalBody(response: Response): Promise<string | undefined> {
    try {
        return (await response.text()).trim().slice(0, MAX_REFUSAL_BODY_CHARS);
    } catch {
        return undefined;
    }
}

/**
 * Blob API backend implementation based on the [Fetch API].
 *
 * [Fetch API]: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 */
export class FetchBlobBackend implements BlobBackend {
    private readonly _deviceId: string;
    private readonly _deviceGroupId: {
        readonly bytes: PublicKey;
        readonly hex: string;
    };
    private readonly _directoryBackend: DirectoryBackend;
    public constructor(private readonly _services: ServicesForBlobBackend) {
        this._deviceId = u64ToHexLe(_services.device.d2m.deviceId);
        this._deviceGroupId = {
            bytes: _services.device.d2m.dgpk.public,
            hex: bytesToHex(_services.device.d2m.dgpk.public),
        };
        this._directoryBackend = _services.directory;
    }

    /** @inheritdoc */
    public async upload(
        blobUploadScope: BlobUploadScope,
        data: EncryptedData,
        options?: BlobUploadOptions,
    ): Promise<BlobId> {
        const blob = new Blob([ensureArrayBufferBackedView(data)]);
        const formData = new FormData();
        formData.append('blob', blob);

        let scope: BlobScope;
        let shouldPersist;
        switch (blobUploadScope) {
            case 'local':
                scope = 'local';
                shouldPersist = false;
                break;
            case 'public-volatile':
                scope = 'public';
                shouldPersist = false;
                break;
            case 'public-persistent':
                scope = 'public';
                shouldPersist = true;
                break;
            default:
                unreachable(blobUploadScope);
        }

        let response: Response;

        // F1Whisper fork: every upload is cancellable and bounded in time. `AbortSignal.any` makes
        // the caller's signal and the safety cap act as one; a deliberate cancel is reported as
        // `aborted`, the cap as an ordinary transport failure.
        const callerSignal = options?.signal;
        const timeoutSignal = AbortSignal.timeout(UPLOAD_MAX_DURATION_MS);
        const signal =
            callerSignal === undefined
                ? timeoutSignal
                : AbortSignal.any([callerSignal, timeoutSignal]);

        let auth;
        try {
            auth = await this._fetchAuthToken();
        } catch (error) {
            // F1Whisper fork: a token failure is a transport failure of this upload, not a raw error.
            if (callerSignal?.aborted === true) {
                throw new BlobBackendError('aborted', 'Upload was cancelled', {from: error});
            }
            throw new BlobBackendError(
                'fetch',
                'Could not obtain the upload authentication token',
                {
                    from: error,
                    // The directory answered (e.g. refused the token or sent garbage) unless the
                    // request itself did not get through.
                    responded:
                        error instanceof DirectoryError &&
                        error.type !== 'fetch' &&
                        error.type !== 'timeout',
                },
            );
        }
        try {
            response = await this._fetch(
                this._services.config.BLOB_SERVER_URLS.upload(
                    this._deviceGroupId.bytes,
                    shouldPersist,
                ),
                scope,
                {
                    method: 'POST',
                    headers: {
                        ...auth,
                        accept: 'text/plain',
                    },
                    body: formData,
                    signal,
                },
            );
        } catch (error) {
            if (callerSignal?.aborted === true) {
                throw new BlobBackendError('aborted', 'Upload request was cancelled', {
                    from: error,
                });
            }
            throw new BlobBackendError('fetch', 'Fetch upload request errored', {from: error});
        }
        if (response.status !== 200) {
            // F1Whisper fork: keep the status and the server's short reason so the failure can be
            // classified (retry, wait, or give up) instead of being one generic error.
            throw new BlobBackendError(
                'fetch',
                `Could not upload blob, status: ${response.status}`,
                {
                    status: response.status,
                    body: await readRefusalBody(response),
                },
            );
        }

        // F1Whisper fork: a body that does not arrive is a transport failure; a body that arrives but
        // is not a blob id is an (unusable) answer.
        let responseText: string;
        try {
            responseText = (await response.text()).trim();
        } catch (error) {
            throw new BlobBackendError('fetch', 'Could not read the upload response', {
                from: error,
            });
        }
        let blobId: ReturnType<typeof hexToBytes> | undefined;
        try {
            blobId = hexToBytes(responseText);
        } catch {
            blobId = undefined;
        }
        if (blobId === undefined || !isBlobId(blobId)) {
            throw new BlobBackendError(
                'invalid-blob-id',
                `Could not upload blob, invalid blob id returned: ${responseText.slice(0, 64)}`,
                {responded: true},
            );
        }
        return blobId;
    }

    /** @inheritdoc */
    public async download(scope: BlobScope, id: BlobId): Promise<BlobDownloadResult> {
        const idString = blobIdToString(id);
        let response: Response;
        try {
            response = await this._fetch(
                this._services.config.BLOB_SERVER_URLS.download(
                    this._deviceGroupId.bytes,
                    idString,
                ),
                scope,
                {
                    method: 'GET',
                    headers: {
                        accept: 'application/octet-stream',
                    },
                },
            );
        } catch (error) {
            throw new BlobBackendError('fetch', 'Fetch download request errored', {from: error});
        }
        if (response.status === 404) {
            throw new BlobBackendError(
                'not-found',
                `Could not download blob ${idString}, status: ${response.status}`,
            );
        }
        if (response.status !== 200) {
            throw new BlobBackendError(
                'fetch',
                `Could not download blob ${idString}, status: ${response.status}`,
            );
        }

        let arrayBuffer: ArrayBuffer;
        try {
            arrayBuffer = await response.arrayBuffer();
        } catch (error) {
            throw new BlobBackendError('fetch', 'Could not allocate blob content into buffer', {
                from: error,
            });
        }
        return {
            data: new Uint8Array(arrayBuffer) as EncryptedData,
            done: async (doneScope: BlobScope) => await this._done(id, doneScope),
        };
    }

    /**
     * Mark a blob as 'done' (i.e. eligible for removal once all devices have downloaded the blob).
     *
     * @throws {BlobBackendError} if an invalid device group or device id has been provided, in case
     *   the server could not be reached or had an internal error.
     */
    private async _done(id: BlobId, scope: BlobScope): Promise<void> {
        const idString = blobIdToString(id);
        let response: Response;
        try {
            response = await this._fetch(
                this._services.config.BLOB_SERVER_URLS.done(this._deviceGroupId.bytes, idString),
                scope,
                {
                    method: 'POST',
                },
            );
        } catch (error) {
            throw new BlobBackendError('fetch', 'Fetch done request errored', {from: error});
        }
        if (response.status !== 204) {
            throw new BlobBackendError(
                'fetch',
                `Could not mark blob ${idString} as done, status: ${response.status}`,
            );
        }
    }

    private async _fetch(url: URL, scope: BlobScope, init: RequestInit): Promise<Response> {
        // Apply URL search parameters and fetch
        url = new URL(url);
        url.search = new URLSearchParams([
            ...url.searchParams,
            ...new URLSearchParams({
                deviceId: this._deviceId,
                deviceGroupId: this._deviceGroupId.hex,
                scope,
            }),
        ]).toString();
        return await fetch(url, {
            ...init,
            cache: 'no-store',
            headers: {
                // eslint-disable-next-line @typescript-eslint/no-misused-spread
                ...init.headers,
                'user-agent': this._services.config.USER_AGENT,
            },
        });
    }

    /*
     * Fetches an authentication token from the directory server if needed.
     */
    private async _fetchAuthToken(): Promise<{readonly authorization?: string}> {
        if (import.meta.env.BUILD_ENVIRONMENT !== 'onprem') {
            return {};
        }

        const token = await this._directoryBackend.authToken();
        return {authorization: `Token ${token}`};
    }
}
