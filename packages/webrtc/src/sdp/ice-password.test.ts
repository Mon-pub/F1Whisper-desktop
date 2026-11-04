import {describe, expect, it} from 'vitest';

import {ensureIcePassword, isIcePassword} from './ice-password.js';

describe('isIcePassword', () => {
    it('returns true for a 22-character string', () => {
        // Act
        const result = isIcePassword('a'.repeat(22));

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a longer string', () => {
        // Act
        const result = isIcePassword('a'.repeat(40));

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a 21-character string', () => {
        // Act
        const result = isIcePassword('a'.repeat(21));

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an empty string', () => {
        // Act
        const result = isIcePassword('');

        // Assert
        expect(result).toBe(false);
    });
});

describe('ensureIcePassword', () => {
    it('returns the value for a valid password', () => {
        // Arrange
        const value = 'a'.repeat(22);

        // Act
        const result = ensureIcePassword(value);

        // Assert
        expect(result).toBe(value);
    });

    it('throws for a too-short value', () => {
        // Arrange
        function fn(): void {
            ensureIcePassword('short');
        }

        // Assert
        expect(fn).toThrow("Not a valid ICE password: 'short'");
    });
});
