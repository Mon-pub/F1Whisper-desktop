/**
 * Returns whether the given `value` is a {@link Function}, and acts as a type guard.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function isFunction(value: unknown): value is Function {
    return typeof value === 'function';
}
