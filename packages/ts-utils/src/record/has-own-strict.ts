import type {UnknownRecord} from './unknown-record.js';

/**
 * Returns whether an object has a specific property.
 *
 * Note: The functionality of this function is equivalent to {@link Object.hasOwn} with the
 *       difference that the `key` parameter needs to exist in the provided object.
 */
export function hasOwnStrict<TRecord extends UnknownRecord, TKey extends keyof TRecord>(
    record: TRecord,
    key: TKey,
): boolean {
    return Object.hasOwn(record, key);
}
