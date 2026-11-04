import {describe, expect, it} from 'vitest';

import {byteEquals} from './byte-equals.js';

describe('byteEquals', () => {
    it('returns true for two empty arrays', () => {
        expect(byteEquals(new Uint8Array(0), new Uint8Array(0))).toBe(true);
    });

    it('returns true when comparing identical byte sequences', () => {
        expect(byteEquals(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
    });

    it('returns false when the byte sequences differ at any position', () => {
        expect(byteEquals(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 9, 3))).toBe(false);
    });

    it('returns false when the arrays have different lengths', () => {
        expect(byteEquals(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2))).toBe(false);
        expect(byteEquals(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(false);
    });
});
