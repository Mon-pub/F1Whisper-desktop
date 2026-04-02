import {describe, expect, it} from 'vitest';

import {isNull} from './is-null.js';

describe('isNull', () => {
    it('returns true for null', () => {
        // Arrange
        const value = null;

        // Act
        const result = isNull(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for undefined', () => {
        // Arrange
        const value = undefined;

        // Act
        const result = isNull(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a number', () => {
        // Arrange
        const value = 0;

        // Act
        const result = isNull(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an empty string', () => {
        // Arrange
        const value = '';

        // Act
        const result = isNull(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an object', () => {
        // Arrange
        const value = {};

        // Act
        const result = isNull(value);

        // Assert
        expect(result).toBe(false);
    });
});
