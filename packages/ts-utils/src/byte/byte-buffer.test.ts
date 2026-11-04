import {describe, expect, it} from 'vitest';

import {ByteBuffer, ByteBufferClaim} from './byte-buffer.js';

describe('ByteBufferClaim', () => {
    it('exposes the claimed sub-array', () => {
        const array = Uint8Array.of(1, 2, 3);
        const claim = new ByteBufferClaim(array, () => {
            // No-op
        });
        expect(claim.array).toBe(array);
    });

    it('ends the claim with the amount of bytes used', () => {
        const array = Uint8Array.of(1, 2, 3);
        let ended: number | undefined;
        const claim = new ByteBufferClaim(array, (length) => {
            ended = length;
        });
        claim.end(2);
        expect(ended).toBe(2);
    });

    it('throws when accessing the array after the claim ended', () => {
        const claim = new ByteBufferClaim(Uint8Array.of(1, 2, 3), () => {
            // No-op
        });
        claim.end(0);
        expect(() => claim.array).toThrow('Buffer claim already ended!');
    });
});

describe('ByteBuffer', () => {
    it('starts with an offset of 0', () => {
        const buffer = new ByteBuffer(new Uint8Array(8), {debug: false});
        expect(buffer.offset).toBe(0);
    });

    describe('bytes', () => {
        it('returns non-overlapping sub-arrays and advances the offset', () => {
            const buffer = new ByteBuffer(Uint8Array.of(0, 1, 2, 3, 4, 5), {debug: false});
            const first = buffer.bytes(2);
            const second = buffer.bytes(3);
            expect([...first]).toEqual([0, 1]);
            expect([...second]).toEqual([2, 3, 4]);
            expect(buffer.offset).toBe(5);
        });

        it('throws when the requested length exceeds the remaining size', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            expect(() => buffer.bytes(5)).toThrow(
                'Could not create sub-array, length exhausted (remaining=4, requested=5)',
            );
        });

        it('throws when the buffer is claimed', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            buffer.claim();
            expect(() => buffer.bytes(1)).toThrow('Cannot create sub-array, buffer is claimed!');
        });
    });

    describe('claim', () => {
        it('claims the remaining sub-array from the current offset', () => {
            const buffer = new ByteBuffer(Uint8Array.of(0, 1, 2, 3), {debug: false});
            buffer.bytes(1);
            const claim = buffer.claim();
            expect([...claim.array]).toEqual([1, 2, 3]);
        });

        it('throws when the buffer is already claimed', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            buffer.claim();
            expect(() => buffer.claim()).toThrow('Cannot claim buffer as it is already claimed!');
        });

        it('releases the claim once it ends, allowing a new claim', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            const claim = buffer.claim();
            claim.end(0);
            expect(() => buffer.claim()).not.toThrow();
        });
    });

    describe('with', () => {
        it('runs the encoder against the remaining sub-array and advances the offset', () => {
            const buffer = new ByteBuffer(new Uint8Array(8), {debug: false});
            const result = buffer.with((array) => {
                array[0] = 0xff;
                array[1] = 0xee;
                return array.subarray(0, 2);
            });
            expect([...result]).toEqual([0xff, 0xee]);
            expect(buffer.offset).toBe(2);
        });

        it('throws when the buffer is claimed', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            buffer.claim();
            expect(() => buffer.with((array) => array)).toThrow(
                'Cannot run consumer with sub-array, buffer is claimed!',
            );
        });
    });

    describe('copy', () => {
        it('copies the given array into the buffer and returns the written region', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            const copy = buffer.copy(Uint8Array.of(7, 8));
            expect([...copy]).toEqual([7, 8]);
            expect(buffer.offset).toBe(2);
        });
    });

    describe('reset', () => {
        it('rewinds the offset and returns itself', () => {
            const buffer = new ByteBuffer(new Uint8Array(8), {debug: false});
            buffer.bytes(3);
            expect(buffer.reset()).toBe(buffer);
            expect(buffer.offset).toBe(0);
        });

        it('bogus-fills the underlying array in debug mode', () => {
            const array = Uint8Array.of(1, 2, 3, 4);
            const buffer = new ByteBuffer(array, {debug: true});
            buffer.reset();
            expect([...array]).toEqual([0x2e, 0x2e, 0x2e, 0x2e]);
        });

        it('ends a pending claim', () => {
            const buffer = new ByteBuffer(new Uint8Array(4), {debug: false});
            const claim = buffer.claim();
            buffer.reset();
            expect(() => claim.array).toThrow('Buffer claim already ended!');
            // The claim has been released, so a new one can be made.
            expect(() => buffer.claim()).not.toThrow();
        });
    });
});
