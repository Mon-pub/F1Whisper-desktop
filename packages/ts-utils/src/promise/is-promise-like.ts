import {isFunction} from '../function/is-function.js';
import {isObject} from '../object/is-object.js';

/**
 * Returns whether the given `value` is {@link PromiseLike}, and acts as a type guard.
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
        (isObject(value) || isFunction(value)) &&
        // Use of `in` is fine here, since the key is hardcoded.
        //
        // eslint-disable-next-line no-restricted-syntax
        'then' in value &&
        isFunction(value.then)
    );
}
