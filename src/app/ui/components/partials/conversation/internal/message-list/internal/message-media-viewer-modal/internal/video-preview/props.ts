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
    };
    /**
     * Data of the loaded video blob to preview.
     */
    readonly video: LoadedVideoState;
}
