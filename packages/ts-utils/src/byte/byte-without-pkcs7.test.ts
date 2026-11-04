import {describe, expect, it} from 'vitest';

import {byteWithoutPkcs7} from './byte-without-pkcs7.js';

describe('byteWithoutPkcs7', () => {
    it('strips a valid PKCS#7 padding from the end of the array', () => {
        expect(byteWithoutPkcs7(Uint8Array.of(1, 2, 3, 4, 4, 4, 4))).toEqual(
            Uint8Array.of(1, 2, 3),
        );
    });

    it('returns an empty view when the entire array is padding', () => {
        expect(byteWithoutPkcs7(Uint8Array.of(4, 4, 4, 4))).toEqual(new Uint8Array(0));
    });

    it('throws when the last byte represents more padding than the array contains', () => {
        expect(() => byteWithoutPkcs7(Uint8Array.of(1, 5))).toThrow(
            "Invalid PKCS#7 padding byte '-3' for bytes of length 2",
        );
    });

    it('throws when the input is empty', () => {
        expect(() => byteWithoutPkcs7(new Uint8Array(0))).toThrow(
            'No PKCS#7 padding, input is empty',
        );
    });
});
