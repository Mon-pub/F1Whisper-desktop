import {describe, expect, it} from 'vitest';

import {byteEncodeSequence} from './byte-encode-sequence.js';

describe('byteEncodeSequence', () => {
    it('returns an empty view when called without encoders', () => {
        // Arrange
        const buffer = new Uint8Array(4);

        // Act
        const result = byteEncodeSequence(buffer);

        // Assert
        expect(result.byteLength).toBe(0);
    });

    it('calls encoders sequentially and returns the written portion', () => {
        // Arrange
        const buffer = new Uint8Array(10);
        function encoder1(target: Uint8Array): Uint8Array {
            target.set([1, 2, 3]);
            return target.subarray(0, 3);
        }
        function encoder2(target: Uint8Array): Uint8Array {
            target.set([4, 5]);
            return target.subarray(0, 2);
        }

        // Act
        const result = byteEncodeSequence(buffer, encoder1, encoder2);

        // Assert
        expect(result).toEqual(Uint8Array.of(1, 2, 3, 4, 5));
        expect(buffer).toEqual(Uint8Array.of(1, 2, 3, 4, 5, 0, 0, 0, 0, 0));
    });

    it('passes the remaining sub-array to each encoder', () => {
        // Arrange
        const buffer = new Uint8Array(6);
        const offsets: number[] = [];
        function makeEncoder(length: number) {
            return (target: Uint8Array): Uint8Array => {
                offsets.push(target.byteOffset);
                return target.subarray(0, length);
            };
        }

        // Act
        byteEncodeSequence(buffer, makeEncoder(2), makeEncoder(3));

        // Assert
        expect(offsets).toEqual([0, 2]);
    });
});
