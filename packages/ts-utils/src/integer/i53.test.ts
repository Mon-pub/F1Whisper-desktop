import {describe, expect, it} from 'vitest';

import {ensureI53, isI53} from './i53.js';

describe('isI53', () => {
    it('returns true for 0', () => {
        expect(isI53(0)).toBe(true);
    });

    it('returns true for the maximum safe integer', () => {
        expect(isI53(Number.MAX_SAFE_INTEGER)).toBe(true);
    });

    it('returns true for the minimum safe integer', () => {
        expect(isI53(Number.MIN_SAFE_INTEGER)).toBe(true);
    });

    it('returns false for a value beyond `Number.MAX_SAFE_INTEGER`', () => {
        expect(isI53(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });

    it('returns false for a value below `Number.MIN_SAFE_INTEGER`', () => {
        expect(isI53(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
    });

    it('returns false for a non-integer number', () => {
        expect(isI53(1.5)).toBe(false);
    });

    it('returns false for a non-number value', () => {
        expect(isI53('42')).toBe(false);
    });
});

describe('ensureI53', () => {
    it('returns the value for a valid i53', () => {
        expect(ensureI53(-1234)).toBe(-1234);
    });

    it('throws for a value out of range', () => {
        expect(() => ensureI53(Number.MAX_SAFE_INTEGER + 1)).toThrow(
            'is not a valid integer in the i53 range',
        );
    });

    it('throws for a non-number value', () => {
        expect(() => ensureI53('foo')).toThrow('is not a valid integer in the i53 range');
    });
});
