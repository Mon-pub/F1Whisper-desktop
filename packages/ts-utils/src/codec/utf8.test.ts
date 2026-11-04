import {afterEach, describe, expect, expectTypeOf, it, vi} from 'vitest';

import {UTF8} from './utf8.js';

interface TextEncoder {
    encodeInto: (source: string, destination: Uint8Array) => {read?: number; written?: number};
}
// eslint-disable-next-line @typescript-eslint/naming-convention
declare const TextEncoder: {prototype: TextEncoder; new (): TextEncoder};

// Multi-byte UTF-8 test string covering ASCII, a 4-byte emoji and the highest
// codepoint of the supplementary private use area.
const testString = 'Hi 😎􏿿';
const testBytes = new Uint8Array([
    0x48, 0x69, 0x20, 0xf0, 0x9f, 0x98, 0x8e, 0xf4, 0x8f, 0xbf, 0xbf,
]);

describe('UTF8', () => {
    describe('decode', () => {
        it('decodes a multi-byte UTF-8 sequence to the original string', () => {
            // Act
            const result = UTF8.decode(testBytes);

            // Assert
            expectTypeOf(result).toEqualTypeOf('string');
            expect(result).toBe(testString);
        });

        it('throws a TypeError for invalid UTF-8 bytes', () => {
            // From https://www.cl.cam.ac.uk/~mgk25/ucs/examples/UTF-8-test.txt
            // Arrange: surrogate pair encoded as UTF-8 (invalid).
            const invalidUtf8Bytes = new Uint8Array([0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80]);

            // Assert
            expect(() => UTF8.decode(invalidUtf8Bytes)).toThrow(TypeError);
        });
    });

    describe('encode', () => {
        it('encodes a multi-byte string to the expected UTF-8 bytes', () => {
            // Act
            const result = UTF8.encode(testString);

            // Assert
            expect(result).toBeInstanceOf(Uint8Array);
            expect(Array.from(result)).toEqual(Array.from(testBytes));
        });
    });

    describe('encodeFullyInto', () => {
        it('encodes a string fully into an exactly-sized Uint8Array', () => {
            // Arrange
            const array = new Uint8Array(testBytes.byteLength);

            // Act
            const result = UTF8.encodeFullyInto(testString, array);

            // Assert
            expect(result.encoded).toBeInstanceOf(Uint8Array);
            expect(result.array).toBe(array);
            expect(Array.from(result.encoded)).toEqual(Array.from(testBytes));
            expect(result.encoded).toEqual(array.subarray(0, testBytes.byteLength));
            expect(result.rest).toEqual(array.subarray(testBytes.byteLength));
            expect(result.rest.byteLength).toBe(0);
        });

        it('encodes a string fully into a larger array', () => {
            // Arrange
            const array = new Uint8Array(testBytes.byteLength + 4);

            // Act
            const result = UTF8.encodeFullyInto(testString, array);

            // Assert
            expect(result.encoded).toBeInstanceOf(Uint8Array);
            expect(Array.from(result.encoded)).toEqual(Array.from(testBytes));
            expect(result.encoded).toEqual(array.subarray(0, testBytes.byteLength));
            expect(result.rest).toEqual(array.subarray(testBytes.byteLength));
            expect(result.rest.byteLength).toBe(4);
        });

        it('throws when the provided array is too small', () => {
            // Arrange
            const array = new Uint8Array(testBytes.byteLength - 1);

            // Act / Assert
            expect(() => UTF8.encodeFullyInto(testString, array)).toThrow('insufficient space');
        });

        it('throws when "written" is undefined', () => {
            // Arrange
            const array = new Uint8Array(5);
            const spy = vi
                .spyOn(TextEncoder.prototype, 'encodeInto')
                .mockReturnValue({read: 2, written: undefined});

            // Act / Assert
            try {
                expect(() => UTF8.encodeFullyInto('hi', array)).toThrow(
                    'Unable to encode string info buffer, "written" is undefined',
                );
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('encodePartiallyInto', () => {
        it('encodes a string fully when the array is large enough', () => {
            // Arrange
            const array = new Uint8Array(testBytes.byteLength);

            // Act
            const result = UTF8.encodePartiallyInto(testString, array);

            // Assert
            expect(result.encoded).toBeInstanceOf(Uint8Array);
            expect(result.array).toBe(array);
            expect(Array.from(result.encoded)).toEqual(Array.from(testBytes));
            expect(result.encoded).toEqual(array.subarray(0, testBytes.byteLength));
            expect(result.rest).toEqual(array.subarray(testBytes.byteLength));
        });

        it('encodes a string partially when the array is shorter', () => {
            // Arrange
            const array = new Uint8Array(testBytes.byteLength - 4);

            // Act
            const result = UTF8.encodePartiallyInto(testString, array);

            // Assert
            expect(Array.from(result.encoded)).toEqual(Array.from(testBytes.subarray(0, -4)));
        });

        it('does not write partial multi-byte characters', () => {
            // Arrange: chop the last two bytes of the trailing 4-byte char, so
            // the buffer is mid-codepoint. The encoder must skip the partial
            // char and leave those tail bytes untouched (zero).
            const expectedBytes = testBytes.slice(0, -2);
            expectedBytes[expectedBytes.byteLength - 1] = 0;
            expectedBytes[expectedBytes.byteLength - 2] = 0;
            const array = new Uint8Array(expectedBytes.byteLength);

            // Act
            const result = UTF8.encodePartiallyInto(testString, array);

            // Assert
            expect(result.array).toBeInstanceOf(Uint8Array);
            expect(Array.from(result.array)).toEqual(Array.from(expectedBytes));
            expect(Array.from(result.encoded)).toEqual(
                Array.from(expectedBytes.subarray(0, expectedBytes.byteLength - 2)),
            );
            expect(Array.from(result.rest)).toEqual([0, 0]);
        });

        it('treats undefined "written" as zero bytes encoded', () => {
            // Arrange
            const array = new Uint8Array(5);
            const spy = vi
                .spyOn(TextEncoder.prototype, 'encodeInto')
                .mockReturnValue({read: 0, written: undefined});

            // Act
            const result = UTF8.encodePartiallyInto('hi', array);

            // Assert
            try {
                expect(result.encoded.byteLength).toBe(0);
                expect(result.rest.byteLength).toBe(5);
            } finally {
                spy.mockRestore();
            }
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
});
