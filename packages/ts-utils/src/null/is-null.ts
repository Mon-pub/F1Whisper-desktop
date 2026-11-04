/**
 * Returns whether the given `value` is `null`, and acts as a type guard.
 */
// eslint-disable-next-line @typescript-eslint/no-restricted-types
export function isNull(value: unknown): value is null {
    return value === null;
}
