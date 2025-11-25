import type {Snippet} from 'svelte';

import type Tooltip from '~/app/ui/generic/popover/Tooltip.svelte';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

/**
 * Props accepted by the `Hint` component.
 */
export interface HintProps {
    /**
     * The element to add a tooltip to. Replaces the `icon` property, if given.
     */
    readonly children?: Snippet<[SvelteNullableBinding<Tooltip>]>;
    /**
     * Id of this element. Note: This must be unique across the entire DOM.
     */
    readonly id: string;
    /**
     * An icon to display as the tooltip's anchor. Has no effect if `children` are given.
     */
    readonly icon?: string;
    /**
     * Position of the tooltip relative to the anchor element. Defaults to `"top"`.
     */
    readonly position?: 'top' | 'bottom';
    readonly text: string;
}
