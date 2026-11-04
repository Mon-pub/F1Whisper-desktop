import {describe, expect, it} from 'vitest';

import {ensureDtlsFingerprint, isDtlsFingerprint} from './dtls-fingerprint.js';

describe('isDtlsFingerprint', () => {
    it('returns true for a non-zero 32-byte array', () => {
        // Arrange
        const array = new Uint8Array(32);
        array[0] = 1;

        // Act
        const result = isDtlsFingerprint(array);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false for a 32-byte array of zeros', () => {
        // Arrange
        const array = new Uint8Array(32);

        // Act
        const result = isDtlsFingerprint(array);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an array shorter than 32 bytes', () => {
        // Arrange
        const array = new Uint8Array(31);
        array[0] = 1;

        // Act
        const result = isDtlsFingerprint(array);

        // Assert
        expect(result).toBe(false);
    });

    it('returns false for an array longer than 32 bytes', () => {
        // Arrange
        const array = new Uint8Array(33);
        array[0] = 1;

        // Act
        const result = isDtlsFingerprint(array);

        // Assert
        expect(result).toBe(false);
    });
});

describe('ensureDtlsFingerprint', () => {
    it('returns the value for a valid fingerprint', () => {
        // Arrange
        const array = new Uint8Array(32);
        array[0] = 1;

        // Act
        const result = ensureDtlsFingerprint(array);

        // Assert
        expect(result).toBe(array);
    });

    it('throws for an invalid fingerprint', () => {
        // Arrange
        function fn(): void {
            ensureDtlsFingerprint(new Uint8Array(32));
        }

        // Assert
        expect(fn).toThrow('Not a valid DTLS fingerprint');
    });
});
