import type {u53} from '../integer/u53.js';

/**
 * A generic byte encoder, storing bytes inside a sub-array.
 *
 * The returned array **must** be a sub-array and point into a portion of the
 * given array! It **must** have the same starting offset as the given array
 * as many of our APIs depend on it!
 */
export type ByteEncoder = (array: Uint8Array) => Uint8Array;

/**
 * A generic byte encoder that also supplies an additional function to query the
 * resulting byte length of the encoded data.
 */
export interface ByteLengthEncoder {
    /**
     * Retrieve the amount of bytes that would be written in case
     * {@link ByteLengthEncoder#encode} were called.
     */
    byteLength: () => u53;

    /**
     * Encode the data in the supplied array. See {@link ByteEncoder}.
     */
    encode: ByteEncoder;
}

/**
 * From T, pick a set of encoder properties and leave the rest as is.
 * See {@link ByteLengthEncoder} on which properties can be picked.
 */
export type EncoderPick<T, P extends keyof ByteLengthEncoder> = {
    [K in keyof T]: T[K] extends Uint8Array | ByteLengthEncoder
        ? Uint8Array | Pick<ByteLengthEncoder, P>
        : T[K];
};
