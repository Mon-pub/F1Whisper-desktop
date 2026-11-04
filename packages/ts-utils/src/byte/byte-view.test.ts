import {describe, expect, it} from 'vitest';

import {byteView} from './byte-view.js';

describe('byteView', () => {
    it('creates a `DataView` over the same buffer, offset and length', () => {
        // Arrange
        const buffer = new ArrayBuffer(8);
        new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6, 7, 8]);
        // Bytes 3..6
        const source = new Uint8Array(buffer, 2, 4);

        // Act
        const view = byteView(DataView, source);

        // Assert
        expect(view.buffer).toBe(buffer);
        expect(view.byteOffset).toBe(2);
        expect(view.byteLength).toBe(4);
        expect(view.getUint8(0)).toBe(3);
        expect(view.getUint8(3)).toBe(6);
    });
});
