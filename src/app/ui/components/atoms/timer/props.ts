import type {Snippet} from 'svelte';

/**
 * Props accepted by the `Timer` component.
 */
export interface TimerProps {
    /**
     * Optional snippet to display as this component's children.
     */
    readonly snippetTimeDisplay?: Snippet<[current: string]>;
    /**
     * The date to show the relative duration for (relative to now).
     */
    readonly from: Date;
}
