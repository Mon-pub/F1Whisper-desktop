/**
 * Represents a nullable binding in Svelte. Note: This is a simple union type with `null`. The
 * reason this is necessary is because Svelte might set a binding to `null` if the referenced
 * element or component is not mounted.
 */

import {untrack} from 'svelte';

// eslint-disable-next-line @typescript-eslint/no-restricted-types
export type SvelteNullableBinding<T> = T | null;

/**
 * Wraps a function with additional dependencies, so that Svelte will re-evaluate it if any of the
 * given dependencies change.
 *
 * Note: Calls to this function must always be in a reactive statement, e.g.:
 *
 * @example
 * ```
 * $effect(() => {
 *   reactive(fooFn, [bar, baz]);
 * });
 * ```
 */
export function reactive<TReturn>(fn: () => TReturn, dependencies: unknown[]): TReturn {
    // Because dependencies are passed explicitly, Svelte should not track any state accessed or
    // written inside `fn` as a dependency.
    return untrack(fn);
}
