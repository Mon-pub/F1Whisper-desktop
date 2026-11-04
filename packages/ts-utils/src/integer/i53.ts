// I53 type.
//
// Note: These do not require explicit casting as that would be annoying when
//       doing math operations due to the lack of operator type overloading.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export type i53 = number;

/**
 * Type guard for {@link i53}.
 */
export function isI53(val: unknown): val is i53 {
    return (
        typeof val === 'number' &&
        Number.isInteger(val) &&
        val >= Number.MIN_SAFE_INTEGER &&
        val <= Number.MAX_SAFE_INTEGER
    );
}

/**
 * Ensure value is a valid {@link i53}.
 */
export function ensureI53(val: unknown): i53 {
    if (!isI53(val)) {
        throw new Error(`Value ${val} is not a valid integer in the i53 range`);
    }
    return val;
}
