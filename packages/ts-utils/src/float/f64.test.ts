import {describe, expect, it} from 'vitest';

import {isF64} from './f64.js';

describe('isF64', () => {
    it('returns true for 0', () => {
        // Act
        const result = isF64(0);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for an integer', () => {
        // Act
        const result = isF64(1234);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a negative fractional number', () => {
        // Act
        const result = isF64(-1.5);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a value beyond `Number.MAX_SAFE_INTEGER`', () => {
        // Act
        const result = isF64(Number.MAX_SAFE_INTEGER + 1);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for `Number.MAX_VALUE`', () => {
        // Act
        const result = isF64(Number.MAX_VALUE);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for `Number.MIN_VALUE`', () => {
        // Act
        const result = isF64(Number.MIN_VALUE);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for `Infinity`', () => {
        // Act
        const result = isF64(Infinity);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for `-Infinity`', () => {
        // Act
        const result = isF64(-Infinity);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for `NaN`', () => {
        // Act
        const result = isF64(NaN);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a numeric string', () => {
        // Arrange
        const value = '42';

        // Act
        const result = isF64(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a bigint', () => {
        // Arrange
        const value = 42n;

        // Act
        const result = isF64(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for null', () => {
        // Arrange
        const value = null;

        // Act
        const result = isF64(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for undefined', () => {
        // Arrange
        const value = undefined;

        // Act
        const result = isF64(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an object', () => {
        // Arrange
        const value = {};

        // Act
        const result = isF64(value);

        // Assert
        expect(result).toBe(false);
    });
});
