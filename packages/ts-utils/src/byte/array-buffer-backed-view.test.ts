import {describe, expect, it} from 'vitest';

import {
    ensureArrayBufferBackedView,
    isArrayBuffer,
    isArrayBufferBackedView,
} from './array-buffer-backed-view.js';

/**
 * Stand-in for a buffer from another realm: `instanceof` does not recognise it, while
 * `Object.prototype.toString` does. A real one cannot be constructed without a platform-specific
 * API (e.g. Node's `vm`).
 */
function foreignBuffer(tag: 'ArrayBuffer' | 'SharedArrayBuffer'): unknown {
    return {[Symbol.toStringTag]: tag};
}

describe('isArrayBuffer', () => {
    it('accepts an `ArrayBuffer`', () => {
        expect(isArrayBuffer(new ArrayBuffer(8))).toBe(true);
    });

    it('accepts an `ArrayBuffer` from another realm', () => {
        // Arrange
        const foreign = foreignBuffer('ArrayBuffer');

        // Act & assert
        expect(foreign instanceof ArrayBuffer).toBe(false);
        expect(isArrayBuffer(foreign)).toBe(true);
    });

    it('rejects a `SharedArrayBuffer`', () => {
        expect(isArrayBuffer(new SharedArrayBuffer(8))).toBe(false);
    });

    it('rejects a `SharedArrayBuffer` from another realm', () => {
        expect(isArrayBuffer(foreignBuffer('SharedArrayBuffer'))).toBe(false);
    });

    it('rejects a value that is not a buffer', () => {
        expect(isArrayBuffer('nope')).toBe(false);
    });
});

describe('isArrayBufferBackedView', () => {
    it('accepts a `Uint8Array` backed by an `ArrayBuffer`', () => {
        expect(isArrayBufferBackedView(new Uint8Array(8))).toBe(true);
    });

    it('accepts a `DataView` backed by an `ArrayBuffer`', () => {
        expect(isArrayBufferBackedView(new DataView(new ArrayBuffer(8)))).toBe(true);
    });

    it('rejects a view backed by a `SharedArrayBuffer`', () => {
        expect(isArrayBufferBackedView(new Uint8Array(new SharedArrayBuffer(8)))).toBe(false);
    });

    it('rejects a value that is not a view', () => {
        expect(isArrayBufferBackedView(new ArrayBuffer(8))).toBe(false);
    });
});

describe('ensureArrayBufferBackedView', () => {
    it('returns the same view when backed by an `ArrayBuffer`', () => {
        // Arrange
        const array = new Uint8Array([1, 2, 3]);

        // Act & assert
        expect(ensureArrayBufferBackedView(array)).toBe(array);
    });

    it('throws when backed by a `SharedArrayBuffer`', () => {
        expect(() => ensureArrayBufferBackedView(new Uint8Array(new SharedArrayBuffer(8)))).toThrow(
            'Byte view is not backed by an ArrayBuffer',
        );
    });
});
