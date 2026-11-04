import {describe, expect, it} from 'vitest';

import {ensureRtpHeaderExtensionId, isRtpHeaderExtensionId} from './rtp-header-extension-id.js';

describe('isRtpHeaderExtensionId', () => {
    it('returns true for 1 (lower bound)', () => {
        // Act
        const result = isRtpHeaderExtensionId(1);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for 14 (upper bound)', () => {
        // Act
        const result = isRtpHeaderExtensionId(14);

        // Assert
        expect(result).toBe(true);
    });

    it('returns true for a value in the middle of the range', () => {
        // Act
        const result = isRtpHeaderExtensionId(7);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for 0', () => {
        // Act
        const result = isRtpHeaderExtensionId(0);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for 15', () => {
        // Act
        const result = isRtpHeaderExtensionId(15);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a non-integer number', () => {
        // Act
        const result = isRtpHeaderExtensionId(1.5);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for a non-number value', () => {
        // Act
        const result = isRtpHeaderExtensionId('5' as unknown as number);

        // Assert
        expect(result).toBe(false);
    });
});

describe('ensureRtpHeaderExtensionId', () => {
    it('returns the value for a valid ID', () => {
        // Act
        const result = ensureRtpHeaderExtensionId(7);

        // Assert
        expect(result).toBe(7);
    });

    it('throws for an out-of-range value', () => {
        // Arrange
        function fn(): void {
            ensureRtpHeaderExtensionId(0);
        }

        // Assert
        expect(fn).toThrow('Not a valid RTP header extension ID');
    });
});
