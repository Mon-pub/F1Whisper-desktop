import type {DbReceiverLookup} from '~/common/db';
import type {MessageType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {MessageId} from '~/common/network/types';
import type {ReadonlyUint8Array, StrictExtract} from '~/common/types';
import {ensureError, unreachable} from '~/common/utils/assert';
import type {ProxyMarked, RemoteProxy} from '~/common/utils/endpoint';
import type {FileBytesAndMediaType} from '~/common/utils/file';
import {getThumbnailMediaType, mediaTypeToImageType} from '~/common/utils/image';

/**
 * This service provides media-related functionality that runs in the frontend.
 *
 * Among other things, it supports generating image and video thumbnails using DOM methods that are
 * not available in the backend worker.
 */
export interface IFrontendMediaService extends ProxyMarked {
    /**
     * Generate an image thumbnail from the specified image bytes.
     */
    readonly generateImageThumbnail: (
        bytes: ReadonlyUint8Array,
        mediaType: string,
        log?: Logger,
    ) => Promise<FileBytesAndMediaType>;

    /**
     * Generate an image thumbnail from the specified video bytes.
     */
    readonly generateVideoThumbnail: (
        bytes: ReadonlyUint8Array,
        mediaType: string,
        log?: Logger,
    ) => Promise<FileBytesAndMediaType>;

    /**
     * Refresh the thumbnail cache for the specified message.
     */
    readonly refreshThumbnailCacheForMessage: (
        messageId: MessageId,
        receiverLookup: DbReceiverLookup,
    ) => void;

    /**
     * Return the pixel dimensions of the specified image bytes, or `undefined` if they cannot be
     * determined. Used by the link-preview fetcher (which runs in the worker and has no canvas).
     */
    readonly getImageDimensions: (
        bytes: ReadonlyUint8Array,
        mediaType: string,
    ) => Promise<{readonly width: number; readonly height: number} | undefined>;

    /**
     * Generate a domain-monogram placeholder card image for the given URL (a coloured background
     * deterministic from the host, with the host text). Used for link previews whose page has no
     * usable og:image, so a title-only link still yields a sendable (MODEL-A) image message. Returns
     * EXIF-free JPEG bytes.
     */
    readonly generateLinkPreviewPlaceholder: (url: string) => Promise<
        | {
              readonly bytes: Uint8Array;
              readonly mediaType: string;
              readonly width: number;
              readonly height: number;
          }
        | undefined
    >;
}

/**
 * The backend media service wraps and exposes the functionality of the
 * {@link IFrontendMediaService} in the backend.
 */
export class BackendMediaService {
    public constructor(
        private readonly _log: Logger,
        private readonly _frontendMediaService: RemoteProxy<IFrontendMediaService>,
    ) {}

    public async generateThumbnail(
        bytes: ReadonlyUint8Array,
        messageType: StrictExtract<MessageType, 'image' | 'video'>,
        mediaType: string,
    ): Promise<FileBytesAndMediaType | undefined> {
        try {
            switch (messageType) {
                case 'image': {
                    const imageType = mediaTypeToImageType(mediaType);
                    if (imageType === undefined) {
                        this._log.warn(
                            'Cannot generate thumbnail because image type is not supported',
                        );
                        return undefined;
                    }

                    const thumbnailMediaType = getThumbnailMediaType(imageType);

                    return await this._frontendMediaService.generateImageThumbnail(
                        bytes,
                        thumbnailMediaType,
                    );
                }

                case 'video':
                    // TODO(DESK-1306): Do we need an `isSupportedVideoType` function?
                    return await this._frontendMediaService.generateVideoThumbnail(
                        bytes,
                        mediaType,
                    );

                default:
                    unreachable(messageType);
            }
        } catch (error) {
            this._log.error(`Thumbnail generation failed: ${ensureError(error)}`);
        }

        return undefined;
    }

    /**
     * Refresh the thumbnail cache for the specified message by re-loading the thumbnail.
     */
    public async refreshThumbnailCacheForMessage(
        messageId: MessageId,
        dbReceiverLookup: DbReceiverLookup,
    ): Promise<void> {
        await this._frontendMediaService
            .refreshThumbnailCacheForMessage(messageId, dbReceiverLookup)
            .catch((error: unknown) => this._log.error('Failed to regenerate thumbnail', error));
    }

    /**
     * Return the pixel dimensions of the specified image bytes (delegated to the frontend canvas), or
     * `undefined` if they cannot be determined.
     */
    public async getImageDimensions(
        bytes: ReadonlyUint8Array,
        mediaType: string,
    ): Promise<{readonly width: number; readonly height: number} | undefined> {
        try {
            return await this._frontendMediaService.getImageDimensions(bytes, mediaType);
        } catch (error) {
            this._log.debug(`Image dimensions lookup failed: ${ensureError(error)}`);
            return undefined;
        }
    }

    /**
     * Generate a domain-monogram placeholder image for a link preview (delegated to the frontend
     * canvas). Returns EXIF-free JPEG bytes, or `undefined` on failure.
     */
    public async generateLinkPreviewPlaceholder(url: string): Promise<
        | {
              readonly bytes: Uint8Array;
              readonly mediaType: string;
              readonly width: number;
              readonly height: number;
          }
        | undefined
    > {
        try {
            return await this._frontendMediaService.generateLinkPreviewPlaceholder(url);
        } catch (error) {
            this._log.debug(`Link preview placeholder generation failed: ${ensureError(error)}`);
            return undefined;
        }
    }
}
