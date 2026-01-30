import {groupBy} from './group-by.js';

/**
 * Split an array into distinct chunks, grouped by the result of the grouping function.
 *
 * @example
 * ```ts
 * const chunked = chunkBy([1.5, 2.5, 2.75, 3], (value) => Math.floor(value)); // Returns `[ [1.5], [2.5, 2.75], [3] ]`;
 * ```
 */
export function chunkBy<K, V>(array: readonly V[], fn: (value: V) => K): readonly V[][] {
    return Array.from(groupBy(array, fn).values());
}
