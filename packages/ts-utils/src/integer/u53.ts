// U53 type.
//
// Note: These do not require explicit casting as that would be annoying when
//       doing math operations due to the lack of operator type overloading.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export type u53 = number;

/**
 * Type guard for {@link u53}.
 */
export function isU53(val: unknown): val is u53 {
    return (
        typeof val === 'number' &&
        Number.isInteger(val) &&
        val >= 0 &&
        val <= Number.MAX_SAFE_INTEGER
    );
}

/**
 * Ensure value is a valid {@link u53}.
 */
export function ensureU53(val: unknown): u53 {
    if (!isU53(val)) {
        throw new Error(`Value ${val} is not a valid integer in the u53 range`);
    }
    return val;
}
