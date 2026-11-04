import {describe, expect, it} from 'vitest';

import {ensureU64, isU64} from './u64.js';

describe('isU64', () => {
    it('returns true for the minimum value (0n)', () => {
        expect(isU64(0n)).toBe(true);
    });

    it('returns true for the maximum value (2n**64n - 1n)', () => {
        expect(isU64(2n ** 64n - 1n)).toBe(true);
    });

    it('returns true for a mid-range value', () => {
        expect(isU64(2n ** 32n)).toBe(true);
    });

    it('returns false for a value equal to 2n**64n', () => {
        expect(isU64(2n ** 64n)).toBe(false);
    });

    it('returns false for a negative bigint', () => {
        expect(isU64(-1n)).toBe(false);
    });

    it('returns false for a plain number', () => {
        expect(isU64(42)).toBe(false);
    });

    it('returns false for a non-numeric value', () => {
        expect(isU64('42')).toBe(false);
    });
});

describe('ensureU64', () => {
    it('returns the value for a valid u64', () => {
        expect(ensureU64(42n)).toBe(42n);
    });

    it('throws for a negative bigint', () => {
        expect(() => ensureU64(-1n)).toThrow('Value -1 is not a valid integer in the u64 range');
    });

    it('throws for a non-bigint value', () => {
        expect(() => ensureU64(42)).toThrow('Value 42 is not a valid integer in the u64 range');
    });
});
