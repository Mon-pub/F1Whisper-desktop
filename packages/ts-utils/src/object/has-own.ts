/**
 * Typed variant of {@link Object.hasOwn}, which acts as a type guard (widens the type to include
 * the given property if it is present).
 */
export function hasOwn<TKey extends PropertyKey>(
    obj: object,
    key: TKey,
): obj is object & Record<TKey, unknown> {
    return Object.hasOwn(obj, key);
}
