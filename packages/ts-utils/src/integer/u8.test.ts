import {describe, expect, it} from 'vitest';

import {ensureU8, isU8} from './u8.js';

describe('isU8', () => {
    it('returns true for 0', () => {
        // Act
        const result = isU8(0);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for 255', () => {
        // Act
        const result = isU8(255);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a value in the middle of the range', () => {
        // Act
        const result = isU8(42);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for 256', () => {
        // Act
        const result = isU8(256);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for -1', () => {
        // Act
        const result = isU8(-1);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a non-integer number', () => {
        // Act
        const result = isU8(1.5);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a non-number value', () => {
        // Act
        const result = isU8('42');

        // Assert
        expect(result).toBe(false);
    });
});

describe('ensureU8', () => {
    it('returns the value for a valid u8', () => {
        // Act
        const result = ensureU8(123);

        // Assert
        expect(result).toBe(123);
    });

    it('throws for a value out of range', () => {
        // Arrange
        function fn(): void {
            ensureU8(300);
        }

        // Assert
        expect(fn).toThrow('Value 300 is not a valid unsigned byte (type is number)');
    });

    it('throws for a non-number value', () => {
        // Arrange
        function fn(): void {
            ensureU8('foo');
        }

        // Assert
        expect(fn).toThrow('Value foo is not a valid unsigned byte (type is string)');
    });
});
