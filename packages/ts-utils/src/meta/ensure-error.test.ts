import {describe, expect, it} from 'vitest';

import {ensureError} from './ensure-error.js';

describe('ensureError', () => {
    it('returns the same instance when the value is already an `Error`', () => {
        // Arrange
        const error = new Error('boom');

        // Act + Assert
        expect(ensureError(error)).toBe(error);
    });

    it('returns the same instance for `Error` subclasses', () => {
        // Arrange
        const error = new TypeError('not a number');

        // Act + Assert
        expect(ensureError(error)).toBe(error);
    });

    it('wraps a non-`Error` value into an `Error` with the stringified contents', () => {
        // Act
        const wrappedString = ensureError('not an error');
        const wrappedNumber = ensureError(42);
        const wrappedNull = ensureError(null);
        const wrappedUndefined = ensureError(undefined);

        // Assert
        expect(wrappedString).toBeInstanceOf(Error);
        expect(wrappedString.message).toBe('not an error');
        expect(wrappedNumber.message).toBe('42');
        expect(wrappedNull.message).toBe('null');
        expect(wrappedUndefined.message).toBe('undefined');
    });
});
