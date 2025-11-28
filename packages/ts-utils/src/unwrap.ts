import {assert} from './assert.js';

/**
 * Expect that a value exists and narrow the type accordingly.
 *
 * @throws {Error} If the value is `null` or `undefined`.
 */
export function unwrap<T>(
    value:
        | T
        // eslint-disable-next-line @typescript-eslint/no-restricted-types
        | null
        | undefined,
    message?: string,
): T {
    assert(value !== undefined && value !== null, message);
    return value;
}
