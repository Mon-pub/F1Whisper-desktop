import type {DOMAttributes, HTMLInputAttributes} from 'svelte/elements';

/**
 * Props accepted by the `Switch` component.
 */
export interface SwitchProps
    extends Pick<DOMAttributes<HTMLElement>, 'onclick'>,
        Omit<HTMLInputAttributes, 'onclick' | 'on:click'> {
    /** Whether the `Switch` is checked. Defaults to `false`. */
    readonly checked?: boolean;
    /** Whether the `Switch` is disabled. Defaults to `false`. */
    readonly disabled?: boolean;
}
