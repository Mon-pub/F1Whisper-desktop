import type {u53} from '../integer/u53.js';

/**
 * Finite iterable with a specific length.
 */
export interface BoundedIterable<T> extends Iterable<T> {
    /**
     * The amount of items the iterable yields.
     */
    length: u53;
}
