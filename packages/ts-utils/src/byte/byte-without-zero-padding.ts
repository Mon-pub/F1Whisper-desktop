import type {ReadonlyUint8Array} from '../array/readonly-uint8-array.js';

/**
 * Return a view of the byte array, ignoring any zeroes at the end.
 */
export function byteWithoutZeroPadding<T extends ReadonlyUint8Array>(array: T): T {
    for (let offset = array.byteLength; offset > 0; --offset) {
        if (array[offset - 1] !== 0x0) {
            return array.subarray(0, offset) as T;
        }
    }
    return array.subarray(0, 0) as T;
}
