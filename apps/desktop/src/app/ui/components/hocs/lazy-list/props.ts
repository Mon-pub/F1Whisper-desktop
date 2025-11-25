import type {Snippet} from 'svelte';

import type {u53} from '~/common/types';
import type {IQueryableStore} from '~/common/utils/store';

/**
 * Props accepted by the `LazyList` component.
 * Note: The element must have a unique ID that is unique over the whole list.
 */
export interface LazyListProps<TProps extends {readonly id: unknown}> {
    /** Items to render as part of the `LazyList`. */
    readonly items: IQueryableStore<TProps>[];
    /** Callback to handle errors that are caught in `LazyList`. */
    readonly onerror?: (error: Error) => void;
    /**
     * Dispatched when an item was anchored (i.e. it was scrolled to or became the `visibleItem`).
     */
    readonly onitemanchored?: (item: TProps) => void;
    /** Dispatched when an item has fully entered the visible area of the chat. */
    readonly onitementered?: (item: TProps) => void;
    /** Dispatched when an item has fully exited the visible area of the chat. */
    readonly onitemexited?: (item: TProps) => void;
    /**
     * Dispatched when the list is scrolled. Note: For performance reasons, this event is debounced.
     */
    readonly onscroll?: (state: {distanceFromBottomPx: u53}) => void;
    /** Optional snippet to display as the footer of the list. */
    readonly snippetAfter?: Snippet;
    /** Optional snippet to display as the header of the list. */
    readonly snippetBefore?: Snippet;
    /** Snippet to render as the list item. */
    readonly snippetItem?: Snippet<[item: IQueryableStore<TProps>]>;
    /**
     * The id of the item that the visible area should be scrolled to. Note: Whenever this value
     * changes, the respective item will be made visible again (jumping to it if necessary).
     */
    readonly visibleItemId?: TProps['id'];
}
