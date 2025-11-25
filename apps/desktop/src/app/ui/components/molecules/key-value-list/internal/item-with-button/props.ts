import type {Snippet} from 'svelte';
import type {HTMLButtonAttributes} from 'svelte/elements';

/**
 * Props accepted by the `KeyValueList.ItemWithButton` component.
 */
export interface ItemWithButtonProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    readonly children?: Snippet;
    readonly icon: string;
    /**
     * The key of the list item. Note: Will be used as the title.
     */
    readonly key: string;
    readonly onclickinfoicon?: (event: MouseEvent) => void;
    readonly options?: {
        readonly showInfoIcon?: boolean;
        readonly disabled?: boolean;
    };
}
