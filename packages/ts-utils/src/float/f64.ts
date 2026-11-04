// F64 type.
//
// Note: These do not require explicit casting as that would be annoying when doing math operations
//       due to the lack of operator type overloading.
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export type f64 = number;

/**
 * Type guard for {@link f64}.
 */
export function isF64(val: unknown): val is f64 {
    return typeof val === 'number';
}
