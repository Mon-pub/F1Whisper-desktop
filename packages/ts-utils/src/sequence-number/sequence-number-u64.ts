import type {u64} from '../integer/u64.js';

/**
 * A generic 64-bit unsigned sequence number. Prevents wrapping.
 */
export class SequenceNumberU64<SNV extends u64> {
    private static readonly _MAX_VALUE = 2n ** 64n - 1n;
    private _value: u64;

    public constructor(start: u64) {
        this._value = start;
    }

    /**
     * Return the next sequence number (i.e. the current value plus one).
     * Increases the internal value by one.
     */
    public next(): SNV {
        if (this._value === SequenceNumberU64._MAX_VALUE) {
            throw new Error('Sequence number would overflow');
        }
        this._value += 1n;
        return this._value as SNV;
    }
}
