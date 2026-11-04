import {DelayedError} from './delayed-error.js';

const UNSET = Symbol('unset');

/**
 * Like {@link Delayed}, but allows the value to be replaced after being set. Useful when the value
 * must be available early but may be recreated.
 */
export class ResettableDelayed<T> {
    private readonly _title: string;
    private _value: T | typeof UNSET = UNSET;

    public constructor(title: string) {
        this._title = title;
    }

    /**
     * Return whether or not the inner value has been set.
     */
    public isSet(): boolean {
        return this._value !== UNSET;
    }

    /**
     * Return the optional value or throw an error if the inner value is not available.
     *
     * @throws In case the inner value has not been set, yet.
     * @returns The inner value.
     */
    public unwrap(): T {
        if (this._value === UNSET) {
            throw new DelayedError('get', this._title);
        }
        return this._value;
    }

    /**
     * Set or replace the inner value.
     *
     * @param value The inner value.
     */
    public set(value: T): void {
        this._value = value;
    }
}
