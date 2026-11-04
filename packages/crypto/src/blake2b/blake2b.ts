import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import {UTF8} from '@threema/ts-utils/codec/utf8';
import type {u53} from '@threema/ts-utils/integer/u53';

import type {ReadonlyRawKey, SecretKeyLength} from '../index.js';

import {createHash, PERSONALBYTES, SALTBYTES} from './implementation.js';

/**
 * A subset of valid Blake2b hash lengths relevant for our use cases.
 */
export type Blake2bHashLength = 32 | 64;

/**
 * A subset of valid Blake2b key lengths relevant for our use cases.
 *
 * Note: This **must** be a subset of {@link SecretKeyLength}.
 */
export type Blake2bKeyLength = SecretKeyLength & (32 | 64);

/** Blake2b hash parameters. */
export interface Blake2bParameters {
    /**
     * The 'personal' to use for hashing, usually for namespacing. Limited to 8 bytes for
     * compatibility with the high-level libsodium API.
     */
    readonly personal: Uint8Array | string;

    /**
     * The 'salt' to use for hashing, usually for deriving distinct keys/hashes from the same input.
     * Limited to 8 bytes for compatibility with the high-level libsodium API.
     */
    readonly salt: Uint8Array | string;
}

/** A streaming Blake2b hasher. */
export interface Blake2bHasher {
    /** Add more data to be hashed. */
    readonly update: (input: ReadonlyUint8Array) => Blake2bHasher;
    /** Finalize the hash and return the resulting digest. */
    readonly digest: () => Uint8Array;
}

function encodeAndZeroPad(
    parameter: string | ReadonlyUint8Array | undefined,
    length: u53,
): ReadonlyUint8Array | undefined {
    if (parameter === undefined) {
        return undefined;
    }
    if (typeof parameter === 'string') {
        return UTF8.encodeFullyInto(parameter, new Uint8Array(length)).array;
    }
    return parameter;
}

/**
 * Create a streaming Blake2b hasher.
 *
 * Note: `personal` and `salt` must not exceed 8 bytes (the remaining bytes of the 16-byte
 * parameter blocks are required to be zero-padding, matching the high-level libsodium API).
 *
 * @param length The desired digest length in bytes.
 * @param key The optional key to use for hashing.
 * @param parameters The optional `personal` and `salt` parameters.
 * @returns A streaming {@link Blake2bHasher}.
 * @throws {Error} If `personal` or `salt` are too long.
 * @throws {Utf8EncodingError} If `personal` or `salt` could not be UTF-8 encoded.
 */
export function blake2bHash(
    length: Blake2bHashLength,
    key: ReadonlyRawKey<Blake2bKeyLength> | undefined,
    parameters: Blake2bParameters | undefined,
): Blake2bHasher {
    // UTF-8 encode and zero-pad 'personal' and 'salt', if necessary.
    const personal = encodeAndZeroPad(parameters?.personal, PERSONALBYTES);
    const salt = encodeAndZeroPad(parameters?.salt, SALTBYTES);

    // Ensure that 'personal' and 'salt' only use the first 8 bytes (i.e. the remaining bytes must
    // be zero-padding).
    if (personal?.subarray(8).some((byte) => byte !== 0) ?? false) {
        throw new Error("Blake2b 'personal' too long");
    }
    if (salt?.subarray(8).some((byte) => byte !== 0) ?? false) {
        throw new Error("Blake2b 'salt' too long");
    }

    return createHash(length, key?.unwrap() ?? null, salt ?? null, personal ?? null);
}
