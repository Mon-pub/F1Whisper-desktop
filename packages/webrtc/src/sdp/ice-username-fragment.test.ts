import {describe, expect, it} from 'vitest';

import {ensureIceUsernameFragment, isIceUsernameFragment} from './ice-username-fragment.js';

describe('isIceUsernameFragment', () => {
    it('returns true for a 4-character string', () => {
        // Act
        const result = isIceUsernameFragment('abcd');

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a longer string', () => {
        // Act
        const result = isIceUsernameFragment('abcdefghij');

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a 3-character string', () => {
        // Act
        const result = isIceUsernameFragment('abc');

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an empty string', () => {
        // Act
        const result = isIceUsernameFragment('');

        // Assert
        expect(result).toBe(false);
    });
});

describe('ensureIceUsernameFragment', () => {
    it('returns the value for a valid fragment', () => {
        // Act
        const result = ensureIceUsernameFragment('abcd');

        // Assert
        expect(result).toBe('abcd');
    });

    it('throws for a too-short value', () => {
        // Arrange
        function fn(): void {
            ensureIceUsernameFragment('abc');
        }

        // Assert
        expect(fn).toThrow("Not a valid ICE username fragment: 'abc'");
    });
});
