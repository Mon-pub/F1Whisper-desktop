import {describe, expect, it} from 'vitest';

import {SequenceNumberU53} from './sequence-number-u53.js';

describe('SequenceNumberU53', () => {
    it('exposes the start value via `current`', () => {
        // Arrange
        const sn = new SequenceNumberU53(7);

        // Act + Assert
        expect(sn.current).toBe(7);
    });

    it('returns the start value + 1 on the first call to `next`', () => {
        // Arrange
        const sn = new SequenceNumberU53(0);

        // Act + Assert
        expect(sn.next()).toBe(1);
    });

    it('advances `current` together with `next`', () => {
        // Arrange
        const sn = new SequenceNumberU53(5);

        // Act
        const value = sn.next();

        // Assert
        expect(value).toBe(6);
        expect(sn.current).toBe(6);
    });

    it('returns consecutive sequence numbers', () => {
        // Arrange
        const sn = new SequenceNumberU53(100);

        // Act + Assert
        expect(sn.next()).toBe(101);
        expect(sn.next()).toBe(102);
        expect(sn.next()).toBe(103);
    });

    it('throws when the next value would overflow the u53 range', () => {
        // Arrange
        const max = 2 ** 53 - 1;
        const sn = new SequenceNumberU53(max);

        // Act + Assert
        expect(() => sn.next()).toThrow('Sequence number would overflow');
    });
});
