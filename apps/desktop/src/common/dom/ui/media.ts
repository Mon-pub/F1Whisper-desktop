import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import {ensureArrayBufferBackedView} from '@threema/ts-utils/byte/array-buffer-backed-view';
import type {Delayed} from '@threema/ts-utils/delayed/delayed';

import type {DbReceiverLookup} from '~/common/db';
import {generateLinkPreviewPlaceholder} from '~/common/dom/ui/link-preview-placeholder';
import type {ThumbnailCacheService} from '~/common/dom/ui/thumbnail-cache';
import {downsizeImage, getImageDimensions} from '~/common/dom/utils/image';
import {TRANSFER_HANDLER} from '~/common/index';
import type {IFrontendMediaService} from '~/common/media';
import {CSP_THUMBNAIL_QUALITY, CSP_VIDEO_THUMBNAIL_TYPE} from '~/common/network/protocol/constants';
import type {MessageId} from '~/common/network/types';
import {PROXY_HANDLER} from '~/common/utils/endpoint';
import type {FileBytesAndMediaType} from '~/common/utils/file';
import {generateVideoThumbnail} from '~/common/utils/video';

/**
 * The max width or height (in px) of a thumbnail in the conversation view.
 */
export const MAX_CONVERSATION_THUMBNAIL_SIZE = 384;

/**
 * The max width or height (in px) of high-quality local thumbnails. Use double the
 * {@link MAX_CONVERSATION_THUMBNAIL_SIZE} to account for high-DPI displays.
 */
const LOCAL_THUMBNAIL_MAX_SIZE = MAX_CONVERSATION_THUMBNAIL_SIZE * 2;
/**
 * The JPEG quality level of high-quality local thumbnails.
 */
const LOCAL_THUMBNAIL_QUALITY = 0.88;

export class FrontendMediaService implements IFrontendMediaService {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public constructor(
        private readonly _services: Delayed<{readonly thumbnailCache: ThumbnailCacheService}>,
    ) {}

    /** @inheritdoc */
    public async generateImageThumbnail(
        bytes: ReadonlyUint8Array,
        mediaType: string,
    ): Promise<FileBytesAndMediaType> {
        const downsizedImage = await downsizeImage(
            new Blob([ensureArrayBufferBackedView(bytes)], {type: mediaType}),
            mediaType,
            LOCAL_THUMBNAIL_MAX_SIZE,
            LOCAL_THUMBNAIL_QUALITY,
        );
        if (downsizedImage === undefined) {
            throw new Error('Failed to downsize image');
        }
        const arrayBuffer = await downsizedImage.resized.arrayBuffer();
        return {
            bytes: new Uint8Array(arrayBuffer),
            mediaType,
        };
    }

    /** @inheritdoc */
    public async generateVideoThumbnail(
        bytes: ReadonlyUint8Array,
        mediaType: string,
    ): Promise<FileBytesAndMediaType> {
        const file = new File([ensureArrayBufferBackedView(bytes)], 'in_memory_temp_video', {
            type: mediaType,
        });
        const result = await generateVideoThumbnail(
            file,
            CSP_VIDEO_THUMBNAIL_TYPE,
            CSP_THUMBNAIL_QUALITY,
            10,
        );

        const resultBytes = await result?.bytes();

        if (resultBytes === undefined) {
            throw new Error('Failed to create video thumbnail');
        }

        return {
            bytes: resultBytes,
            mediaType,
        };
    }

    /** @inheritdoc */
    public refreshThumbnailCacheForMessage(
        messageId: MessageId,
        receiverLookup: DbReceiverLookup,
    ): void {
        this._services.unwrap().thumbnailCache.refreshCacheForMessage(messageId, receiverLookup);
    }

    /** @inheritdoc */
    public async getImageDimensions(
        bytes: ReadonlyUint8Array,
        mediaType: string,
    ): Promise<{readonly width: number; readonly height: number} | undefined> {
        return await getImageDimensions(
            new Blob([ensureArrayBufferBackedView(bytes)], {type: mediaType}),
        );
    }

    /** @inheritdoc */
    public async generateLinkPreviewPlaceholder(url: string): Promise<
        | {
              readonly bytes: Uint8Array;
              readonly mediaType: string;
              readonly width: number;
              readonly height: number;
          }
        | undefined
    > {
        return await generateLinkPreviewPlaceholder(url);
    }
}
