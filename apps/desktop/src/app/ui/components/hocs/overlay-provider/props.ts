import type {Snippet} from 'svelte';

/**
 * Props accepted by the `Overlay` component.
 */
export interface OverlayProviderProps {
    /** Whether the overlay should be displayed. */
    readonly show?: boolean;
    /** Optional snippet to display on top of the overlay. */
    readonly snippetAbove?: Snippet;
    /** Optional snippet to display below the overlay (i.e., the content covered by the overlay). */
    readonly snippetBelow?: Snippet;
}
