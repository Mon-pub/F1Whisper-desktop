import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

/** An ICE password must be at least 22 characters. */
export type IcePassword = WeakOpaque<string, {readonly IcePassword: unique symbol}>;

export function isIcePassword(value: string): value is IcePassword {
    return value.length >= 22;
}

export function ensureIcePassword(value: string): IcePassword {
    if (!isIcePassword(value)) {
        throw Error(`Not a valid ICE password: '${value}'`);
    }
    return value;
}
