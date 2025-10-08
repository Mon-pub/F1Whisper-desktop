import {untrack} from 'svelte';

import type {Logger} from '~/common/logging';

/**
 * Represents a nullable binding in Svelte. Note: This is a simple union type with `null`. The
 * reason this is necessary is because Svelte might set a binding to `null` if the referenced
 * element or component is not mounted.
 */
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

/**
 * A graceful version of `unreachable` for svelte components that does not throw. This should be
 * used in templates only.
 *
 * This should be used in svelte components to avoid crashes where the svelte instruction order
 * matters (which can be anywhere and occur at any update anew).
 */
export function svelteUnreachable(
    value: never,
    info?: {readonly log: Logger; readonly message: string},
): void {
    info?.log.debug(info.message);
}
