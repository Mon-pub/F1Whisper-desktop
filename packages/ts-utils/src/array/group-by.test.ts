import {describe, expect, it} from 'vitest';

import {groupBy} from './group-by.js';

describe('groupBy', () => {
    it('returns an empty map for an empty array', () => {
        // Arrange
        const input: number[] = [];

        // Act
        const result = groupBy(input, (v) => v);

        // Assert
        expect(result).toBeInstanceOf(Map);
        expect(result.size).toBe(0);
    });

    it('groups values by the result of the keying function', () => {
        // Arrange
        const input = [1.5, 2.5, 2.75, 3];

        // Act
        const result = groupBy(input, (v: number) => Math.floor(v));

        // Assert
        expect(result.get(1)).toEqual([1.5]);
        expect(result.get(2)).toEqual([2.5, 2.75]);
        expect(result.get(3)).toEqual([3]);
    });

    it('puts all values under the same key when all keys are equal', () => {
        // Arrange
        const input = [1, 2, 3];

        // Act
        const result = groupBy(input, () => 'same');

        // Assert
        expect(result.get('same')).toEqual([1, 2, 3]);
    });
});
