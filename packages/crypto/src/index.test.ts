import {describe, expect, it} from 'vitest';

import {blake2bHash} from './blake2b/blake2b.js';

import {CryptoError, deriveKey, isReadonlyRawKey, wrapRawKey} from './index.js';

describe('wrapRawKey', () => {
    it('wraps a 32-byte key which unwraps to the same bytes', () => {
        // Arrange
        const bytes = new Uint8Array(32).fill(0x42);
        const key = wrapRawKey(bytes, 32);

        // Assert
        expect(key.length).toBe(32);
        expect(key.unwrap()).toBe(bytes);
    });

    it('wraps a 64-byte key', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(64).fill(1), 64);

        // Assert
        expect(key.length).toBe(64);
        expect(key.unwrap()).toHaveLength(64);
    });

    it('throws a CryptoError if the key length does not match', () => {
        // Assert
        expect(() => wrapRawKey(new Uint8Array(31), 32)).toThrow(CryptoError);
        expect(() => wrapRawKey(new Uint8Array(31), 32)).toThrow(
            'Expected key to be 32 bytes but has 31 bytes',
        );
    });
});

describe('deriveKey', () => {
    const parameters = {personal: '3ma-test', salt: 'kdf'} as const;

    it('derives the keyed Blake2b digest of the parameters', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(32).fill(2), 32).asReadonly();

        // Act
        const derived = deriveKey(32, key, parameters);
        const expected = blake2bHash(32, key, parameters).digest();

        // Assert
        expect(derived.unwrap()).toEqual(expected);
    });

    it('applies the additional input, if provided', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(32).fill(3), 32).asReadonly();
        const input = Uint8Array.of(1, 2, 3);

        // Act
        const derived = deriveKey(32, key, {...parameters, input});
        const expected = blake2bHash(32, key, parameters).update(input).digest();

        // Assert
        expect(derived.unwrap()).toEqual(expected);
        expect(derived.unwrap()).not.toEqual(deriveKey(32, key, parameters).unwrap());
    });

    it('derives a 64-byte key from a 64-byte key', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(64).fill(4), 64).asReadonly();

        // Act
        const derived = deriveKey(64, key, parameters);

        // Assert
        expect(isReadonlyRawKey(derived.asReadonly(), 64)).toBe(true);
        expect(derived.unwrap()).toHaveLength(64);
    });
});

describe('isReadonlyRawKey', () => {
    it('returns true for a wrapped key of matching length', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(32), 32).asReadonly();

        // Assert
        expect(isReadonlyRawKey(key, 32)).toBe(true);
    });

    it('returns false for a wrapped key of another length', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(64), 64).asReadonly();

        // Assert
        expect(isReadonlyRawKey(key, 32)).toBe(false);
    });

    it('returns false for values that are not wrapped keys', () => {
        // Assert
        expect(isReadonlyRawKey(new Uint8Array(32), 32)).toBe(false);
        expect(isReadonlyRawKey(undefined, 32)).toBe(false);
    });
});

describe('RawKey', () => {
    it('purges the key by overwriting the bytes and preventing further unwrapping', () => {
        // Arrange
        const bytes = new Uint8Array(32).fill(0x42);
        const key = wrapRawKey(bytes, 32);

        // Act
        key.purge();

        // Assert
        expect(bytes).toEqual(new Uint8Array(32).fill(0x23));
        expect(() => key.unwrap()).toThrow('Cannot unwrap, key purged');
    });

    it('ignores purging an already purged key', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(32), 32);

        // Act
        key.purge();

        // Assert
        expect(() => key.purge()).not.toThrow();
    });

    it('changes the reported "purged" state when the key is purged', () => {
        // Arrange
        const key = wrapRawKey(new Uint8Array(32), 32);

        // Assert
        expect(key.purged).toBe(false);

        // Act
        key.purge();

        // Assert
        expect(key.purged).toBe(true);
    });

    it('treats a key whose underlying buffer was transferred as purged', () => {
        // Arrange
        const bytes = new Uint8Array(32).fill(5);
        const key = wrapRawKey(bytes, 32);

        // Act
        //
        // Detach the underlying buffer, simulating a transfer to another thread.
        structuredClone(bytes.buffer, {transfer: [bytes.buffer]});

        // Assert
        expect(() => key.unwrap()).toThrow('Cannot unwrap, key purged');
    });

    it('compares keys by their bytes', () => {
        // Arrange
        const a = wrapRawKey(new Uint8Array(32).fill(6), 32);
        const b = wrapRawKey(new Uint8Array(32).fill(6), 32);
        const c = wrapRawKey(new Uint8Array(32).fill(7), 32);

        // Assert
        expect(a.equals(b)).toBe(true);
        expect(a.equals(c)).toBe(false);
    });

    it('compares a purged key as unequal', () => {
        // Arrange
        const a = wrapRawKey(new Uint8Array(32).fill(8), 32);
        const b = wrapRawKey(new Uint8Array(32).fill(8), 32);

        // Act
        a.purge();

        // Assert
        expect(a.equals(b)).toBe(false);
    });

    it('throws when comparing against a purged key', () => {
        // Arrange
        const a = wrapRawKey(new Uint8Array(32).fill(9), 32);
        const b = wrapRawKey(new Uint8Array(32).fill(9), 32);

        // Act
        b.purge();

        // Assert
        expect(() => a.equals(b)).toThrow('Cannot unwrap, key purged');
    });
});

describe('CryptoError', () => {
    it('is an Error named "CryptoError"', () => {
        // Arrange
        const error = new CryptoError('Lorem ipsum');

        // Assert
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('CryptoError');
        expect(error.message).toBe('Lorem ipsum');
    });
});
