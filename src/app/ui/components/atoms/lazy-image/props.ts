import type {Snippet} from 'svelte';
import type {HTMLButtonAttributes} from 'svelte/elements';

import type {Constraints} from '~/app/ui/components/atoms/lazy-image/types';
import type {ProfilePictureBlobStoreValue} from '~/common/dom/ui/profile-picture';
import type {ThumbnailStoreValue} from '~/common/dom/ui/thumbnail-cache';
import type {Dimensions} from '~/common/types';
import type {IQueryableStore} from '~/common/utils/store';

/**
 * Props accepted by the `LazyImage` component.
 */
export interface LazyImageProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    /**
     * Bytes and dimensions of the image.
     *
     * The dimensions of the blob must be calculated upon fetching.
     *
     * Note: Please ensure the {@link Blob} has a defined media type, or it will be rendered as
     * failed.
     */
    readonly byteStore: IQueryableStore<
        'loading' | ThumbnailStoreValue | ProfilePictureBlobStoreValue | undefined
    >;
    /**
     * Constraints to control the display size of an image.
     */
    readonly constraints: Constraints;
    /**
     * Description of the image, used for accessibility.
     */
    readonly description: string;
    /**
     * Optional full-size dimensions of the image. This will be used to display a placeholder that
     * behaves similarly to the image.
     */
    readonly dimensions?: Dimensions;
    /**
     * Whether the `LazyImage` is clickable and should emit `onclick` events. Defaults to `false`.
     */
    readonly isClickable?: boolean;
    /**
     * Whether the `LazyImage` is focusable (usually with the `Tab` key). Defaults to `false`. Note:
     * Doesn't have any effect if `isClickable` is set to `false`.
     */
    readonly isFocusable?: boolean;
    /**
     * Whether the image should be responsive, i.e. it should not exceed 100% of the parent's width
     * or height. Defaults to `false`.
     */
    readonly responsive?: boolean;
    /**
     * Optional snippet to display as content if loading the image has failed.
     */
    readonly snippetFailed?: Snippet;
    /**
     * Optional snippet to display as content while the image is loading.
     */
    readonly snippetLoading?: Snippet;
}
