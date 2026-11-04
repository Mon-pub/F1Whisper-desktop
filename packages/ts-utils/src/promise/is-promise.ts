import {isFunction} from '../function/is-function.js';

import {isPromiseLike} from './is-promise-like.js';

/**
 * Returns whether the given `value` is a {@link Promise}, and acts as a type guard.
 */
export function isPromise(value: unknown): value is Promise<unknown> {
    return (
        isPromiseLike(value) &&
        // Use of `in` is fine here, since the key is hardcoded.
        //
        // eslint-disable-next-line no-restricted-syntax
        'catch' in value &&
        isFunction(value.catch) &&
        // Use of `in` is fine here, since the key is hardcoded.
        //
        // eslint-disable-next-line no-restricted-syntax
        'finally' in value &&
        isFunction(value.finally)
    );
}
