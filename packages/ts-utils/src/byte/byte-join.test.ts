import {describe, expect, it} from 'vitest';

import {byteJoin} from './byte-join.js';

describe('byteJoin', () => {
    it('returns an empty array when given no arguments', () => {
        expect(byteJoin()).toEqual(new Uint8Array(0));
    });

    it('returns the single input when given exactly one array', () => {
        expect(byteJoin(Uint8Array.of(1, 2, 3))).toEqual(Uint8Array.of(1, 2, 3));
    });

    it('concatenates multiple byte arrays into a new array', () => {
        expect(byteJoin(Uint8Array.of(1, 2), Uint8Array.of(3, 4, 5), Uint8Array.of(6))).toEqual(
            Uint8Array.of(1, 2, 3, 4, 5, 6),
        );
    });

    it('handles empty input arrays', () => {
        expect(byteJoin(new Uint8Array(0), Uint8Array.of(1), new Uint8Array(0))).toEqual(
            Uint8Array.of(1),
        );
    });
});
