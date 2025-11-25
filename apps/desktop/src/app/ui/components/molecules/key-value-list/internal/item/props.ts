import type {Snippet} from 'svelte';

/**
 * Props accepted by the `Item` component.
 */
export interface ItemProps {
    readonly children?: Snippet;
    /**
     * The key of the list item. Note: Will be used as the title.
     */
    readonly key: string;
    readonly onclickinfoicon?: (event: MouseEvent) => void;
    readonly options?: {
        readonly showInfoIcon?: boolean;
    };
}
