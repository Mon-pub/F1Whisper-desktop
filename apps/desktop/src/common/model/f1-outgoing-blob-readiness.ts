import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * F1Whisper fork: the part of an outgoing file message's view that decides whether its blobs are
 * uploaded. Structural, so it fits every file-based message type (file, image, video, audio).
 */
export interface OutgoingBlobState {
    readonly fileData?: {readonly unencryptedByteCount: u53} | undefined;
    readonly blobId?: unknown;
    readonly thumbnailFileData?: {readonly unencryptedByteCount: u53} | undefined;
    readonly thumbnailBlobId?: unknown;
}

/**
 * Number of bytes that still have to be uploaded for a message, or `undefined` if its blobs are
 * all uploaded (or it has none).
 *
 * A blob needs an upload if its local file data exists but it has no blob ID yet; this is the
 * same rule `uploadBlobs` applies.
 */
export function getPendingUploadBytes(state: OutgoingBlobState): u53 | undefined {
    let bytes: u53 | undefined;
    if (state.fileData !== undefined && state.blobId === undefined) {
        bytes = state.fileData.unencryptedByteCount;
    }
    if (state.thumbnailFileData !== undefined && state.thumbnailBlobId === undefined) {
        bytes = (bytes ?? 0) + state.thumbnailFileData.unencryptedByteCount;
    }
    return bytes;
}

/**
 * Whether the send task may run: nothing is left to upload.
 */
export function areBlobsUploaded(state: OutgoingBlobState): boolean {
    return getPendingUploadBytes(state) === undefined;
}
