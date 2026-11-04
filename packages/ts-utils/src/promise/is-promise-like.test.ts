import {describe, expect, it} from 'vitest';

import {isPromiseLike} from './is-promise-like.js';

describe('isPromiseLike', () => {
    it('returns true for a native Promise', () => {
        // Arrange
        const value = Promise.resolve();

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a plain object with a then function', () => {
        // Arrange
        const value = {then: (): void => {}};

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a function with a then function (isFunction branch)', () => {
        // Arrange
        const value = Object.assign((): void => {}, {then: (): void => {}});

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a plain object without a then property', () => {
        // Arrange
        const value = {};

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an object where then is not a function', () => {
        // Arrange
        const value = {then: 'not-a-function'};

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for null', () => {
        // Arrange
        const value = null;

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for undefined', () => {
        // Arrange
        const value = undefined;

        // Act
        const result = isPromiseLike(value);

        // Assert
        expect(result).toBe(false);
    });
});
