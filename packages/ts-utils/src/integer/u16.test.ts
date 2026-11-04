import {describe, expect, it} from 'vitest';

import {ensureU16, isU16} from './u16.js';

describe('isU16', () => {
    it('returns true for the minimum value (0)', () => {
        expect(isU16(0)).toBe(true);
    });

    it('returns true for the maximum value (65535)', () => {
        expect(isU16(65535)).toBe(true);
    });

    it('returns true for a value in the middle of the range', () => {
        expect(isU16(1234)).toBe(true);
    });

    it('returns false for a value above the range', () => {
        expect(isU16(65536)).toBe(false);
    });

    it('returns false for a negative value', () => {
        expect(isU16(-1)).toBe(false);
    });

    it('returns false for a non-integer number', () => {
        expect(isU16(1.5)).toBe(false);
    });

    it('returns false for a non-number value', () => {
        expect(isU16('42')).toBe(false);
    });
});

describe('ensureU16', () => {
    it('returns the value for a valid u16', () => {
        expect(ensureU16(1234)).toBe(1234);
    });

    it('throws for a value out of range', () => {
        expect(() => ensureU16(65536)).toThrow(
            "Number '65536' is not a valid unsigned 16 bit integer",
        );
    });

    it('throws for a non-number value', () => {
        expect(() => ensureU16('foo')).toThrow(
            "Number 'foo' is not a valid unsigned 16 bit integer",
        );
    });
});
