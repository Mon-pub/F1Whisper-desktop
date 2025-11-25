import type {HTMLVideoAttributes} from 'svelte/elements';

import type {LoadedVideoState} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/types';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

/**
 * Props accepted by the `VideoPreview` component.
 */
export interface VideoPreviewProps extends Pick<HTMLVideoAttributes, 'oncontextmenu'> {
    /**
     * Reference to the `video` element in this component.
     */
    readonly element: SvelteNullableBinding<HTMLElement>;

    readonly options?: {
        /**
         * The control list to be displayed. Defaults to `no-download`.
         */
        readonly controlslist?: string;

        /**
         * Whether or not the video should autoplay. Defaults to `true`.
         */
        readonly autoplay?: boolean;

        /**
         * Whether or not to loop the video. Defaults to `true`.
         */
        readonly loop?: boolean;

        /**
         * Whether to resize the video element in a way that it scales to fit its container (but
         * preserves its aspect-ratio), or stretches to fill its container. Defaults to "scale".
         */
        readonly sizingBehavior?: 'scale' | 'stretch';
    };
    /**
     * Data of the loaded video blob to preview.
     */
    readonly video: LoadedVideoState;
}
