import {describe, expect, it} from 'vitest';

import {hasOwnStrict} from './has-own-strict.js';

describe('hasOwnStrict', () => {
    it('returns true for an own property', () => {
        // Arrange
        const obj = {a: 1};

        // Act
        const result = hasOwnStrict(obj, 'a');

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a property that is only on the prototype', () => {
        // Arrange
        const obj = Object.create({a: 1}) as {a: 1};

        // Act
        const result = hasOwnStrict(obj, 'a');

        // Assert
        expect(result).toBe(false);
    });
});
