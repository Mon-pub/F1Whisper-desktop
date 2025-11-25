/**
 * Returns the type of the set item.
 */
export type SetValue<TSet extends ReadonlySet<unknown>> =
    TSet extends ReadonlySet<infer TSetValue> ? TSetValue : never;

/**
 * A - B.
 *
 * Note: Remove soon and use {@link Set.difference}! See:
 * https://caniuse.com/mdn-javascript_builtins_set_difference
 */
export function difference<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
    const c = new Set(a);
    for (const item of b) {
        c.delete(item);
    }
    return c;
}

/**
 * A - B with a transform applied to each element of B.
 */
export function differenceWithTransform<T, K>(
    a: ReadonlySet<T>,
    b: ReadonlySet<K>,
    transform: (element: K) => T,
): Set<T> {
    const c = new Set(a);
    for (const item of b) {
        c.delete(transform(item));
    }
    return c;
}
