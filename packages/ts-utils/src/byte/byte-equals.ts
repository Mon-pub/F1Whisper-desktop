import type {ReadonlyUint8Array} from '../array/readonly-uint8-array.js';

/**
 * Test whether two Uint8Arrays are equal to each other.
 *
 * @returns Whether the Uint8Arrays are equal.
 */
export function byteEquals(left: ReadonlyUint8Array, right: ReadonlyUint8Array): boolean {
    if (left.byteLength !== right.byteLength) {
        return false;
    }
    return left.every((value, index) => value === right[index]);
}
