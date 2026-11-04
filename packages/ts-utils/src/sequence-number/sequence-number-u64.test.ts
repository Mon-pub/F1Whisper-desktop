import {describe, expect, it} from 'vitest';

import {SequenceNumberU64} from './sequence-number-u64.js';

describe('SequenceNumberU64', () => {
    it('returns the start value + 1 on the first call to `next`', () => {
        // Arrange
        const sn = new SequenceNumberU64(0n);

        // Act + Assert
        expect(sn.next()).toBe(1n);
    });

    it('returns consecutive sequence numbers', () => {
        // Arrange
        const sn = new SequenceNumberU64(10n);

        // Act + Assert
        expect(sn.next()).toBe(11n);
        expect(sn.next()).toBe(12n);
        expect(sn.next()).toBe(13n);
    });

    it('starts from an arbitrary value within the u64 range', () => {
        // Arrange
        const start = 2n ** 63n;
        const sn = new SequenceNumberU64(start);

        // Act + Assert
        expect(sn.next()).toBe(start + 1n);
    });

    it('throws when the next value would overflow the u64 range', () => {
        // Arrange
        const max = 2n ** 64n - 1n;
        const sn = new SequenceNumberU64(max);

        // Act + Assert
        expect(() => sn.next()).toThrow('Sequence number would overflow');
    });
});
