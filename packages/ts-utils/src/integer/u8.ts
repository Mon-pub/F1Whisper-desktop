// U8 type.
//
// Note: These do not require explicit casting as that would be annoying when
//       doing math operations due to the lack of operator type overloading.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export type u8 = number;

/**
 * Type guard for {@link u8}.
 */
export function isU8(val: unknown): val is u8 {
    return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 255;
}

/**
 * Ensure value is a valid number in the {@link u8} range.
 */
export function ensureU8(val: unknown): u8 {
    if (!isU8(val)) {
        throw new Error(`Value ${val} is not a valid unsigned byte (type is ${typeof val})`);
    }
    return val;
}
