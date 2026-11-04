import {describe, expect, it} from 'vitest';

import {byteWithoutZeroPadding} from './byte-without-zero-padding.js';

describe('byteWithoutZeroPadding', () => {
    it('returns the array unchanged when there is no trailing zero', () => {
        expect(byteWithoutZeroPadding(Uint8Array.of(1, 2, 3))).toEqual(Uint8Array.of(1, 2, 3));
    });

    it('drops trailing zero bytes', () => {
        expect(byteWithoutZeroPadding(Uint8Array.of(1, 2, 3, 0, 0, 0))).toEqual(
            Uint8Array.of(1, 2, 3),
        );
    });

    it('returns an empty view when the entire input is zero', () => {
        expect(byteWithoutZeroPadding(Uint8Array.of(0, 0, 0))).toEqual(new Uint8Array(0));
    });

    it('returns an empty view when the input is empty', () => {
        expect(byteWithoutZeroPadding(new Uint8Array(0))).toEqual(new Uint8Array(0));
    });
});
