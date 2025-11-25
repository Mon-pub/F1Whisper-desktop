import {ImageType} from '~/common/enum';
import {unreachable} from '~/common/utils/assert';

/**
 * If the specified media type is a supported image media type, return the corresponding
 * {@link ImageType}. Otherwise, return undefined.
 */
export function mediaTypeToImageType(mediaType: string): ImageType | undefined {
    switch (mediaType) {
        case 'image/jpeg':
            return ImageType.JPEG;
        case 'image/png':
            return ImageType.PNG;
        case 'image/gif':
            return ImageType.GIF;
        case 'image/webp':
            return ImageType.WEBP;
        case 'image/avif':
            return ImageType.AVIF;
        default:
            return undefined;
    }
}

/**
 * Return whether or not the specified media type is a supported image media type.
 */
export function isSupportedImageType(mediaType: string): boolean {
    return mediaTypeToImageType(mediaType) !== undefined;
}

/**
 * Return the media type of a thumbnail given the image type.
 */
export function getThumbnailMediaType(imageType: ImageType): 'image/jpeg' | 'image/png' {
    // Note: Chromium does not seem to compress PNGs, so we reduce their size instead to prevent
    //       thumbnails from getting too large
    switch (imageType) {
        case ImageType.JPEG:
        case ImageType.GIF:
        case ImageType.WEBP:
        case ImageType.AVIF:
            return 'image/jpeg';
        case ImageType.PNG:
            return 'image/png';
        default:
            return unreachable(imageType);
    }
}
