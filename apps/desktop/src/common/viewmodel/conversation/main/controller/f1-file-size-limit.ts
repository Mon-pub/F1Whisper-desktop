import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * F1Whisper fork: file message size limit on the PREPARED payload.
 *
 * The compose UI validates the size of the file the user picked. The bytes that are actually
 * encrypted and uploaded can differ (video and audio are transcoded, images are resized), so the
 * limit is enforced again on the final payload, right before it is stored and handed to the upload
 * pipeline. The limit itself is `MAX_FILE_MESSAGE_BYTES` (build-time constant); the server request
 * cap is larger, so a payload that passes this check always fits in one upload request.
 */

/**
 * Result of {@link ConversationViewModelController.sendMessage}.
 *
 * Reported as data instead of a thrown error: a thrown error loses its type across the
 * worker<->DOM proxy boundary, and the UI treats any rejection of a send as unreachable.
 */
export interface SendMessageResult {
    /** File names whose prepared payload exceeded the file size limit. They were NOT sent. */
    readonly tooLargeFileNames: readonly string[];
}

/** Result for sends that cannot exceed the file size limit (text, polls) or had no refusals. */
export const SEND_MESSAGE_NOTHING_REFUSED: SendMessageResult = {tooLargeFileNames: []};

/**
 * Whether a prepared (final, post-transcode) payload is larger than the file message limit.
 *
 * @param byteLength Size of the bytes that would be encrypted and uploaded.
 * @param limit Maximum allowed size in bytes (defaults to the build-time file message limit).
 */
export function isPreparedPayloadTooLarge(
    byteLength: u53,
    limit: u53 = import.meta.env.MAX_FILE_MESSAGE_BYTES,
): boolean {
    return byteLength > limit;
}
