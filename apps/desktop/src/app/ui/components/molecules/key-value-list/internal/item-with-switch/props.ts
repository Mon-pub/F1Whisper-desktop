import type {Snippet} from 'svelte';

/**
 * Props accepted by the `KeyValueList.ItemWithSwitch` component.
 */
export interface ItemWithSwitchProps {
    readonly checked?: boolean;
    readonly children?: Snippet;
    readonly disabled?: boolean;
    /**
     * The key of the list item. Note: Will be used as the title.
     */
    readonly key: string;
    readonly onclickinfoicon?: (event: MouseEvent) => void;
    readonly onswitch?: (state: {readonly old: boolean; readonly new: boolean}) => void;
    readonly options?: {
        readonly showInfoIcon?: boolean;
    };
}
