import {describe, expect, it} from 'vitest';

import {assert} from './assert.js';

describe('assert', () => {
    it('does not throw when condition is true', () => {
        // Arrange
        function fn(): void {
            assert(true);
        }

        // Assert
        expect(fn).not.toThrow();
    });

    it('throws when condition is false', () => {
        // Arrange
        function fn(): void {
            assert(false);
        }

        // Assert
        expect(fn).toThrow();
    });

    it('includes the provided message in the thrown error', () => {
        // Arrange
        function fn(): void {
            assert(false, 'Error message');
        }

        // Assert
        expect(fn).toThrow('Error message');
    });
});
