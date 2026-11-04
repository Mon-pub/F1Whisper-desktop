// U64 type.
//
// Note: These do not require explicit casting as that would be annoying when
//       doing math operations due to the lack of operator type overloading.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export type u64 = bigint;

/**
 * Type guard for {@link u64}.
 */
export function isU64(val: unknown): val is u64 {
    return typeof val === 'bigint' && val >= 0n && val < 2n ** 64n;
}

/**
 * Ensure value is a valid {@link u64}.
 */
export function ensureU64(val: unknown): u64 {
    if (!isU64(val)) {
        throw new Error(`Value ${val} is not a valid integer in the u64 range`);
    }
    return val;
}
