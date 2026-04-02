import {describe, expect, it} from 'vitest';

import {isFunction} from './is-function.js';

describe('isFunction', () => {
    it('returns true for an anonymous function', () => {
        // Act
        const result = isFunction((): void => {});

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a named function', () => {
        // Arrange
        function fn(): void {}

        // Act
        const result = isFunction(fn);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for null', () => {
        // Arrange
        const value = null;

        // Act
        const result = isFunction(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an object', () => {
        // Arrange
        const value = {};

        // Act
        const result = isFunction(value);

        // Assert
        expect(result).toBe(false);
    });
});
