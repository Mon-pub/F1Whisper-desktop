// U16 type.
//
// Note: These do not require explicit casting as that would be annoying when
//       doing math operations due to the lack of operator type overloading.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export type u16 = number;

/**
 * Type guard for {@link u16}.
 */
export function isU16(val: unknown): val is u16 {
    return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 65535;
}

/**
 * Ensure value is a valid {@link u16}.
 */
export function ensureU16(val: unknown): u16 {
    if (!isU16(val)) {
        throw new Error(`Number '${val}' is not a valid unsigned 16 bit integer`);
    }
    return val;
}
