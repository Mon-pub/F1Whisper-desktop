import type {ReadonlyUint8Array} from '../array/readonly-uint8-array.js';

/**
 * Result of a UTF-8 encode _full_ or _partial_ procedure.
 */
interface Utf8EncodeResult {
    /**
     * An alias to the array the string was encoded into.
     *
     * For example, when calling `.encodeFullyInto('hi', new Uint8Array(5))`, this field will be an
     * alias to the array of 5 bytes.
     */
    readonly array: Uint8Array;

    /**
     * A subarray of the given array representing the portion of bytes that were encoded.
     *
     * For example, when calling `.encodeFullyInto('hi', new Uint8Array(5))`, this field will
     * reference a subarray of 2 bytes `'hi'` has been encoded into.
     */
    readonly encoded: Uint8Array;

    /**
     * The remaining bytes that are left unused.
     *
     * For example, when calling `.encodeFullyInto('hi', new Uint8Array(5))`, this field will
     * reference a subarray of the trailing 3 bytes.
     */
    readonly rest: Uint8Array;
}

/**
 * A UTF-8 text encoder/decoder.
 */
export interface Utf8Codec {
    /**
     * Decode UTF-8 bytes to a string.
     */
    readonly decode: (array: ReadonlyUint8Array) => string;

    /**
     * Encode a string to UTF-8 bytes.
     */
    readonly encode: (source: string) => Uint8Array;

    /**
     * Encode a string into UTF-8 bytes using the provided array.
     *
     * @throws {Utf8EncodingError} in case the provided array provides insufficient space.
     */
    readonly encodeFullyInto: (source: string, array: Uint8Array) => Utf8EncodeResult;

    /**
     * Encode a string into UTF-8 bytes using the provided array.
     *
     * Note: This does not throw in case the provided array provides insufficient space!
     */
    readonly encodePartiallyInto: (source: string, array: Uint8Array) => Utf8EncodeResult;
}

// The globals `TextEncoder` and `TextDecoder` exist in both DOM and Node, so
// we'll just assume they're always available.

/* eslint-disable @typescript-eslint/method-signature-style, @typescript-eslint/naming-convention */
// Decoder
interface TextDecoderCommon {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
}
interface TextDecoder extends TextDecoderCommon {
    decode(input?: ArrayBufferView | ArrayBuffer, options?: {stream?: boolean}): string;
}
declare const TextDecoder: {
    prototype: TextDecoder;
    new (label?: string, options?: {fatal?: boolean; ignoreBOM?: boolean}): TextDecoder;
};

// Encoder
interface TextEncoderCommon {
    readonly encoding: string;
}
interface TextEncoder extends TextEncoderCommon {
    encode(input?: string): Uint8Array;
    encodeInto(source: string, destination: Uint8Array): {read?: number; written?: number};
}
declare const TextEncoder: {
    prototype: TextEncoder;
    new (): TextEncoder;
};
/* eslint-enable @typescript-eslint/method-signature-style, @typescript-eslint/naming-convention */

/**
 * Thrown by {@link Utf8Codec.encodeFullyInto} when the destination buffer is too small.
 */
export class Utf8EncodingError extends Error {
    public override readonly name = 'Utf8EncodingError';
}

/**
 * Simple wrapper around {@link TextEncoder} and {@link TextDecoder} for UTF-8
 * encoding/decoding purposes.
 */
class Utf8TextEncoderDecoderCodec implements Utf8Codec {
    private readonly _decoder: TextDecoder;
    private readonly _encoder: TextEncoder;

    public constructor() {
        // Create instances. Use the 'fatal' flag to ensure the decoder throws
        // an error in case a coding error is found.
        this._decoder = new TextDecoder('utf-8', {fatal: true});
        this._encoder = new TextEncoder();
    }

    /** @inheritdoc */
    public decode(array: ReadonlyUint8Array): string {
        return this._decoder.decode(array);
    }

    /** @inheritdoc */
    public encode(source: string): Uint8Array {
        return this._encoder.encode(source);
    }

    /** @inheritdoc */
    public encodeFullyInto(source: string, array: Uint8Array): Utf8EncodeResult {
        const result = this._encoder.encodeInto(source, array);
        if (result.read !== source.length) {
            throw new Utf8EncodingError(
                `Unable to encode string into buffer, ` +
                    `insufficient space: ${source.length} != ${result.read}`,
            );
        }
        if (result.written === undefined) {
            throw new Utf8EncodingError(
                'Unable to encode string info buffer, "written" is undefined',
            );
        }
        return {
            array,
            encoded: array.subarray(0, result.written),
            rest: array.subarray(result.written),
        };
    }

    /** @inheritdoc */
    public encodePartiallyInto(source: string, array: Uint8Array): Utf8EncodeResult {
        const result = this._encoder.encodeInto(source, array);
        return {
            array,
            encoded: array.subarray(0, result.written ?? 0),
            rest: array.subarray(result.written ?? 0),
        };
    }
}

/**
 * A UTF-8 text encoder/decoder.
 */
export const UTF8 = new Utf8TextEncoderDecoderCodec();
