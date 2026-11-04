import {isNull} from '../null/is-null.js';

/**
 * Returns whether the given `value` is an `object`, and acts as a type guard. Note: All
 * non-primitive values are objects, so this will also return `true` for {@link Array}s,
 * {@link Date}s, etc.. as well as regular (i.e., {@link Record}-like) objects.
 *
 * Important: `null` is explicitly excluded here, and will return `false`.
 */
export function isObject(value: unknown): value is object {
    return typeof value === 'object' && !isNull(value);
}
