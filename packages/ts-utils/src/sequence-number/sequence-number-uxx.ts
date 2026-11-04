/**
 * A generic unsigned sequence number in the range of 0 to 2**53 - 1.
 * Prevents wrapping.
 *
 * Shared base for the public {@link SequenceNumberU53} and {@link SequenceNumberU32}; not intended
 * for direct use.
 */
// TODO(DESK-2092): Constrain `SNV` to `u53` once that type is available in this package.
export class SequenceNumberUXX<SNV extends number> {
    private _value: number;

    public constructor(
        start: SNV,
        private readonly _maxValue: SNV,
    ) {
        this._value = start;
    }

    /**
     * Return the current sequence number.
     */
    public get current(): SNV {
        return this._value as SNV;
    }

    /**
     * Return the next sequence number (i.e. the current value plus one).
     * Increases the internal value by one.
     */
    public next(): SNV {
        if (this._value === this._maxValue) {
            throw new Error('Sequence number would overflow');
        }
        this._value += 1;
        return this._value as SNV;
    }
}
