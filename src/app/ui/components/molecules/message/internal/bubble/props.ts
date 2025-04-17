import type {Snippet} from 'svelte';
import type {HTMLButtonAttributes} from 'svelte/elements';

import type {MessageProps} from '~/app/ui/components/molecules/message/props';

/**
 * Props accepted by the `Bubble` component.
 */
export interface BubbleProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    readonly children?: Snippet;
    /**
     * Whether clicking on the bubble should be enabled. Defaults to `false`.
     */
    readonly clickable?: boolean;
    /** The direction of the message used for color shading. */
    readonly direction: MessageProps['direction'] | 'none';
    /**
     * Whether to play an animation to bring attention to the bubble. Resets to `false` when the
     * animation is completed.
     */
    readonly highlighted?: boolean;
    readonly oncompletehighlightanimation?: () => void;
    /** The size of the padding between the bubble and its content. */
    readonly padding?: 'xs' | 'sm' | 'md';
}
