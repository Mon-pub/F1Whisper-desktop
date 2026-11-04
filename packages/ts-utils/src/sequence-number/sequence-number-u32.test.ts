import {describe, expect, it} from 'vitest';

import {SequenceNumberU32} from './sequence-number-u32.js';

describe('SequenceNumberU32', () => {
    it('exposes the start value via `current`', () => {
        // Arrange
        const sn = new SequenceNumberU32(3);

        // Act + Assert
        expect(sn.current).toBe(3);
    });

    it('returns the start value + 1 on the first call to `next`', () => {
        // Arrange
        const sn = new SequenceNumberU32(0);

        // Act + Assert
        expect(sn.next()).toBe(1);
    });

    it('returns consecutive sequence numbers', () => {
        // Arrange
        const sn = new SequenceNumberU32(42);

        // Act + Assert
        expect(sn.next()).toBe(43);
        expect(sn.next()).toBe(44);
    });

    it('throws when the next value would overflow the u32 range', () => {
        // Arrange
        const max = 2 ** 32 - 1;
        const sn = new SequenceNumberU32(max);

        // Act + Assert
        expect(() => sn.next()).toThrow('Sequence number would overflow');
    });
});
