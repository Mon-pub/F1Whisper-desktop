import {describe, expect, it} from 'vitest';

import {chunkBy} from './chunk-by.js';

describe('chunkBy', () => {
    it('returns an empty array for an empty input', () => {
        // Arrange
        const input: number[] = [];

        // Act
        const result = chunkBy(input, (v) => v);

        // Assert
        expect(result).toEqual([]);
    });

    it('splits values into chunks by the result of the grouping function', () => {
        // Arrange
        const input = [1.5, 2.5, 2.75, 3];

        // Act
        const result = chunkBy(input, (v: number) => Math.floor(v));

        // Assert
        expect(result).toEqual([[1.5], [2.5, 2.75], [3]]);
    });

    it('returns a single chunk when all keys are equal', () => {
        // Arrange
        const input = [1, 2, 3];

        // Act
        const result = chunkBy(input, () => 'same');

        // Assert
        expect(result).toEqual([[1, 2, 3]]);
    });
});
