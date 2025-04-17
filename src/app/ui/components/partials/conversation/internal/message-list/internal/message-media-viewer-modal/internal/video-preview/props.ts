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
    /**
     * Data of the loaded video blob to preview.
     */
    readonly video: LoadedVideoState;
}
