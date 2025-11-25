import type {Snippet} from 'svelte';

/**
 * Props accepted by the `KeyValueList.ItemWithHint` component.
 */
export interface ItemWithHintProps {
    readonly children?: Snippet;
    /**
     * The key of the list item. Note: Will be used as the title.
     */
    readonly key: string;

    /**
     * The text rendered inside the tooltip.
     */
    readonly hint: string;

    /**
     * An icon to display as the tooltip's anchor.
     */
    readonly icon: string;
}
