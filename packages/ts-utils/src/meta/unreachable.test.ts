import {describe, expect, it} from 'vitest';

import {unreachable} from './unreachable.js';

describe('unreachable', () => {
    it('throws if reached', () => {
        // Arrange
        function fn(): void {
            unreachable('value' as never);
        }

        // Assert
        expect(fn).toThrow();
    });

    it('throws with the provided custom message', () => {
        // Arrange
        function fn(): void {
            unreachable('value' as never, 'Error message');
        }

        // Assert
        expect(fn).toThrow('Error message');
    });
});
