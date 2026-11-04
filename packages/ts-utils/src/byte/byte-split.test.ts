import {describe, expect, it} from 'vitest';

import {byteSplit} from './byte-split.js';

describe('byteSplit', () => {
    it('does not split an array smaller than `maxChunkLength`', () => {
        const arr = Uint8Array.of(0, 1, 2, 3);
        expect([...byteSplit(arr, 5)]).toEqual([arr]);
        expect([...byteSplit(arr, 99)]).toEqual([arr]);
    });

    it('does not split an array of size `maxChunkLength`', () => {
        const arr = Uint8Array.of(0, 1, 2, 3);
        expect([...byteSplit(arr, arr.byteLength)]).toEqual([arr]);
    });

    it('splits larger arrays into chunks of `maxChunkLength`', () => {
        const arr = Uint8Array.of(1, 2, 3, 4, 5, 6);
        expect([...byteSplit(arr, 5)]).toEqual([Uint8Array.of(1, 2, 3, 4, 5), Uint8Array.of(6)]);
        expect([...byteSplit(arr, 3)]).toEqual([Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5, 6)]);
        expect([...byteSplit(arr, 2)]).toEqual([
            Uint8Array.of(1, 2),
            Uint8Array.of(3, 4),
            Uint8Array.of(5, 6),
        ]);
    });

    it('returns no chunks for an empty array', () => {
        expect([...byteSplit(new Uint8Array(0), 4)]).toEqual([]);
    });
});
