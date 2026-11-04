import {describe, expect, it} from 'vitest';

import {hasOwn} from './has-own.js';

describe('hasOwn', () => {
    it('returns true for an own property', () => {
        // Arrange
        const obj = {a: 1};

        // Act
        const result = hasOwn(obj, 'a');

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a missing property', () => {
        // Arrange
        const obj = {a: 1};

        // Act
        const result = hasOwn(obj, 'b');

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an inherited property', () => {
        // Arrange
        const obj = {};

        // Act
        const result = hasOwn(obj, 'toString');

        // Assert
        expect(result).toBe(false);
    });
});
