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
    RAW_IMAGE_METADATA_SCHEMA,
    RAW_VIDEO_METADATA_SCHEMA,
} from '~/common/network/structbuf/validate/csp/e2e/file';
import {unreachable} from '~/common/utils/assert';
import {isSupportedImageType} from '~/common/utils/image';
import {isVideoFileType} from '~/common/utils/video';

/**
 * Determines the extra properties from a file message.
 */
export function getFileBasedMessageTypeAndExtraProperties(
    fileData: FileJson,
    log: Logger,
):
    | Pick<CommonFileMessageInit, 'type'>
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
      >
    | Pick<CommonVideoMessageInit, 'type' | 'duration' | 'dimensions' | 'spoiler' | 'forwarded'>
    | Pick<CommonAudioMessageInit, 'type' | 'duration' | 'listenOnce' | 'listenOnceConsumed'> {
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
                listenOnceConsumed: parsedMetadata.loc,
            } as const;
        } catch (error) {
            log.warn(`Audio metadata did not pass validation: ${error}`);

            return {
                type: MessageType.AUDIO,
            } as const;
        }
    } else {
        return {
            type: MessageType.FILE,
        } as const;
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
