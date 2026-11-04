import type {ReadonlyUint8Array} from '../array/readonly-uint8-array.js';

/**
 * Join byte arrays by copying the bytes into a new array.
 */
export function byteJoin(...arrays: readonly ReadonlyUint8Array[]): Uint8Array {
    const output = new Uint8Array(arrays.reduce((length, array) => length + array.byteLength, 0));
    let offset = 0;
    for (const array of arrays) {
        output.set(array, offset);
        offset += array.byteLength;
    }
    return output;
}
