import {isReceivedPreviewAllowed} from '~/common/dom/network/link-preview/parse';
import {ImageRenderingType, MessageType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {AnyMessageModelStore} from '~/common/model';
import type {
    AnyImageMessageModelStore,
    AnyVideoMessageModelStore,
} from '~/common/model/types/message';
import type {CommonAudioMessageInit} from '~/common/model/types/message/audio';
import type {CommonFileMessageInit} from '~/common/model/types/message/file';
import type {CommonImageMessageInit} from '~/common/model/types/message/image';
import type {CommonVideoMessageInit} from '~/common/model/types/message/video';
import {
    type FileJson,
    RAW_AUDIO_METADATA_SCHEMA,
    RAW_FILE_METADATA_SCHEMA,
    RAW_IMAGE_METADATA_SCHEMA,
    RAW_VIDEO_METADATA_SCHEMA,
} from '~/common/network/structbuf/validate/csp/e2e/file';
import {ensureMessageId, type MessageId} from '~/common/network/types';
import {ensureError, unreachable} from '~/common/utils/assert';
import {isSupportedImageType} from '~/common/utils/image';
import {hexLeToU64} from '~/common/utils/number';
import {isVideoFileType} from '~/common/utils/video';

/**
 * Parse a quoted-message-id metadata value (F1Whisper fork "quote-any-type", wire key `"qi"`) into a
 * {@link MessageId}.
 *
 * The value must be a 16-hex-LE string, exactly like the quotes-v2 text-quote encoding (see
 * `parsePossibleTextQuote`). A missing or malformed value -- including a value of the wrong TYPE,
 * e.g. a number or object (U-M03: the outer schema accepts `qi` as `unknown`, not `string`, so it no
 * longer rejects the whole metadata object over this) -- is not an error: it is simply ignored (the
 * message is rendered without a quote) so that a corrupt/foreign `qi` value never breaks decoding of
 * the rest of the message's metadata.
 */
function parseQuotedMessageId(qi: unknown, log: Logger): MessageId | undefined {
    if (qi === undefined) {
        return undefined;
    }
    if (typeof qi !== 'string') {
        log.warn(`Ignoring malformed quoted message id in file metadata: expected a string`);
        return undefined;
    }
    try {
        return ensureMessageId(hexLeToU64(qi));
    } catch (error) {
        log.warn(
            `Ignoring malformed quoted message id in file metadata: ${ensureError(error).message}`,
        );
        return undefined;
    }
}

/**
 * Determines the extra properties from a file message.
 */
export function getFileBasedMessageTypeAndExtraProperties(
    fileData: FileJson,
    log: Logger,
):
    | Pick<CommonFileMessageInit, 'type' | 'quotedMessageId'>
    | Pick<
          CommonImageMessageInit,
          | 'type'
          | 'renderingType'
          | 'animated'
          | 'dimensions'
          | 'spoiler'
          | 'forwarded'
          | 'linkPreviewUrl'
          | 'linkPreviewTitle'
          | 'linkPreviewDescription'
          | 'quotedMessageId'
      >
    | Pick<
          CommonVideoMessageInit,
          'type' | 'duration' | 'dimensions' | 'spoiler' | 'forwarded' | 'quotedMessageId'
      >
    | Pick<
          CommonAudioMessageInit,
          'type' | 'duration' | 'listenOnce' | 'listenOnceConsumed' | 'quotedMessageId'
      > {
    const isMediaOrSticker =
        fileData.renderingType === 'media' || fileData.renderingType === 'sticker';
    if (isSupportedImageType(fileData.file.mediaType) && isMediaOrSticker) {
        let imageRenderingType: ImageRenderingType;
        switch (fileData.renderingType) {
            case 'media':
                imageRenderingType = ImageRenderingType.REGULAR;
                break;
            case 'sticker':
                imageRenderingType = ImageRenderingType.STICKER;
                break;
            default:
                unreachable(fileData.renderingType);
        }

        try {
            const parsedMetadata = RAW_IMAGE_METADATA_SCHEMA.parse(fileData.metadata ?? {});

            // Receive-side hardening: only surface a link-preview card if its URL passes the same
            // SSRF/spoofing validator the sender ran AND the URL actually appears in the caption.
            // This rejects an injected/mismatched `lp_*` card from a malicious sender (the card would
            // otherwise advertise a URL the recipient never sees in the text). The image itself still
            // renders as an ordinary image+caption; only the preview-card affordance is suppressed.
            const linkPreviewAllowed =
                parsedMetadata.lp_u !== undefined &&
                isReceivedPreviewAllowed(parsedMetadata.lp_u, fileData.caption);

            return {
                type: MessageType.IMAGE,
                renderingType: imageRenderingType,
                animated: parsedMetadata.a,
                dimensions:
                    parsedMetadata.h !== undefined && parsedMetadata.w !== undefined
                        ? {width: parsedMetadata.w, height: parsedMetadata.h}
                        : undefined,
                spoiler: parsedMetadata.sp,
                forwarded: parsedMetadata.fwd,
                linkPreviewUrl: linkPreviewAllowed ? parsedMetadata.lp_u : undefined,
                linkPreviewTitle: linkPreviewAllowed ? parsedMetadata.lp_t : undefined,
                linkPreviewDescription: linkPreviewAllowed ? parsedMetadata.lp_d : undefined,
                quotedMessageId: parseQuotedMessageId(parsedMetadata.qi, log),
            } as const;
        } catch (error) {
            log.warn(`Image metadata did not pass validation: ${error}`);

            return {
                type: MessageType.IMAGE,
                renderingType: imageRenderingType,
                animated: false,
            } as const;
        }
    } else if (isVideoFileType(fileData.file.mediaType) && isMediaOrSticker) {
        try {
            const parsedMetadata = RAW_VIDEO_METADATA_SCHEMA.parse(fileData.metadata ?? {});

            return {
                type: MessageType.VIDEO,
                duration: parsedMetadata.d,
                dimensions:
                    parsedMetadata.h !== undefined && parsedMetadata.w !== undefined
                        ? {width: parsedMetadata.w, height: parsedMetadata.h}
                        : undefined,
                spoiler: parsedMetadata.sp,
                forwarded: parsedMetadata.fwd,
                quotedMessageId: parseQuotedMessageId(parsedMetadata.qi, log),
            } as const;
        } catch (error) {
            log.warn(`Video metadata did not pass validation: ${error}`);

            return {
                type: MessageType.VIDEO,
            } as const;
        }
    } else if (fileData.file.mediaType.startsWith('audio/') && isMediaOrSticker) {
        try {
            const parsedMetadata = RAW_AUDIO_METADATA_SCHEMA.parse(fileData.metadata ?? {});

            return {
                type: MessageType.AUDIO,
                duration: parsedMetadata.d,
                listenOnce: parsedMetadata.lo,
                // FU-M06: ignore any peer-supplied `loc` (it is not parsed from the wire metadata).
                // `listenOnceConsumed` is a purely LOCAL flag flipped only when WE play the message;
                // trusting a peer's value would let a hostile/buggy sender pre-burn our listen-once.
                listenOnceConsumed: undefined,
                quotedMessageId: parseQuotedMessageId(parsedMetadata.qi, log),
            } as const;
        } catch (error) {
            log.warn(`Audio metadata did not pass validation: ${error}`);

            return {
                type: MessageType.AUDIO,
            } as const;
        }
    } else {
        try {
            const parsedMetadata = RAW_FILE_METADATA_SCHEMA.parse(fileData.metadata ?? {});

            return {
                type: MessageType.FILE,
                quotedMessageId: parseQuotedMessageId(parsedMetadata.qi, log),
            } as const;
        } catch (error) {
            log.warn(`File metadata did not pass validation: ${error}`);

            return {
                type: MessageType.FILE,
            } as const;
        }
    }
}

/**
 * Return true if we expect that messages in the specified store might have a thumbnail.
 */
export function messageStoreHasThumbnail(
    messageStore: AnyMessageModelStore,
): messageStore is AnyImageMessageModelStore | AnyVideoMessageModelStore {
    // Note: When adding new variants, make sure to change the return type as well!
    switch (messageStore.type) {
        case 'image':
        case 'video':
            return true;
        case 'text':
        case 'file':
        case 'audio':
        case 'deleted':
        case 'poll':
            return false;
        default:
            return unreachable(messageStore);
    }
}
