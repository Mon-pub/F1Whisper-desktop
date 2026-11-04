import type {ReadonlyUint8Array} from '../array/readonly-uint8-array.js';
import {unwrap} from '../meta/unwrap.js';

/**
 * Create a view excluding any PKCS#7 padding from a byte array.
 *
 * @throws {Error} If the PKCS#7 padding byte is invalid.
 */
export function byteWithoutPkcs7<T extends ReadonlyUint8Array>(array: T): T {
    const length = array.byteLength;
    const end = length - unwrap(array[length - 1], 'No PKCS#7 padding, input is empty');
    if (end < 0) {
        throw new Error(`Invalid PKCS#7 padding byte '${end}' for bytes of length ${length}`);
    }
    return array.subarray(0, end) as T;
}
