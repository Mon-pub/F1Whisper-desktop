import {describe, expect, it} from 'vitest';

import {ensureU53, isU53} from './u53.js';

describe('isU53', () => {
    it('returns true for 0', () => {
        // Act
        const result = isU53(0);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for Number.MAX_SAFE_INTEGER', () => {
        // Act
        const result = isU53(Number.MAX_SAFE_INTEGER);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a value in the middle of the range', () => {
        // Act
        const result = isU53(1234);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a value above Number.MAX_SAFE_INTEGER', () => {
        // Act
        const result = isU53(Number.MAX_SAFE_INTEGER + 1);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for -1', () => {
        // Act
        const result = isU53(-1);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a non-integer number', () => {
        // Act
        const result = isU53(1.5);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a non-number value', () => {
        // Act
        const result = isU53('42');

        // Assert
        expect(result).toBe(false);
    });
});

describe('ensureU53', () => {
    it('returns the value for a valid u53', () => {
        // Act
        const result = ensureU53(123);

        // Assert
        expect(result).toBe(123);
    });

    it('throws for a negative value', () => {
        // Arrange
        function fn(): void {
            ensureU53(-1);
        }

        // Assert
        expect(fn).toThrow('Value -1 is not a valid integer in the u53 range');
    });

    it('throws for a non-number value', () => {
        // Arrange
        function fn(): void {
            ensureU53('foo');
        }

        // Assert
        expect(fn).toThrow('Value foo is not a valid integer in the u53 range');
    });
});
