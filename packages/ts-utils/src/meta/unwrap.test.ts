import {describe, expect, it} from 'vitest';

import {unwrap} from './unwrap.js';

describe('unwrap', () => {
    it('returns the value when it is not null or undefined', () => {
        // Arrange
        const value = 42;

        // Act
        const result = unwrap(value);

        // Assert
        expect(result).toBe(42);
    });

    it('throws when value is null', () => {
        // Arrange
        function fn(): void {
            unwrap(null);
        }

        // Assert
        expect(fn).toThrow();
    });

    it('throws when value is undefined', () => {
        // Arrange
        function fn(): void {
            unwrap(undefined);
        }

        // Assert
        expect(fn).toThrow();
    });

    it('includes the provided message in the thrown error', () => {
        // Arrange
        function fn(): void {
            unwrap(null, 'Expected a value');
        }

        // Assert
        expect(fn).toThrow('Expected a value');
    });
});
