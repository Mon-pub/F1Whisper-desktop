import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

/** An ICE username fragment must be at least 4 characters. */
export type IceUsernameFragment = WeakOpaque<string, {readonly IceUsernameFragment: unique symbol}>;

export function isIceUsernameFragment(value: string): value is IceUsernameFragment {
    return value.length >= 4;
}

export function ensureIceUsernameFragment(value: string): IceUsernameFragment {
    if (!isIceUsernameFragment(value)) {
        throw Error(`Not a valid ICE username fragment: '${value}'`);
    }
    return value;
}
