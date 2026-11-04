import {describe, expect, it} from 'vitest';

import {ByteBuffer} from './byte-buffer.js';
import {bytePadPkcs7} from './byte-pad-pkcs7.js';

describe('bytePadPkcs7', () => {
    it('writes the padding into a byte buffer destination', () => {
        const buffer = new ByteBuffer(new Uint8Array(8), {debug: false});
        const padding = bytePadPkcs7(buffer, 3);
        expect([...padding]).toEqual([3, 3, 3]);
        expect(buffer.offset).toBe(3);
    });

    it('writes the padding into the start of a byte array destination', () => {
        const destination = new Uint8Array(5);
        const padding = bytePadPkcs7(destination, 4);
        expect([...padding]).toEqual([4, 4, 4, 4]);
        // The padding is a view into the destination.
        expect([...destination]).toEqual([4, 4, 4, 4, 0]);
    });

    it('throws when the requested length is larger than the byte array destination', () => {
        expect(() => bytePadPkcs7(new Uint8Array(2), 3)).toThrow(
            'Requested length 3 is larger than the destination array size',
        );
    });
});
