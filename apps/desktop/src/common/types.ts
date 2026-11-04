/**
 * Types defined here are fundamental and used throughout for the whole
 * project.
 */

import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
import type {EncoderPick, ByteLengthEncoder} from '@threema/ts-utils/byte/byte-encoder';
import type {u53} from '@threema/ts-utils/integer/u53';
import type {u8} from '@threema/ts-utils/integer/u8';
import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

/* eslint-disable @typescript-eslint/naming-convention */
// Unsigned and signed integer hint types.
//
// Note: These do not require explicit casting as that would be annoying when
//       doing math operations due to the lack of operator type overloading.
export type i8 = number;
export type u16 = number;
export type i16 = number;
export type u32 = number;
export type i32 = number;
export type i53 = number;
export type u64 = bigint;
export type i64 = bigint;
export type ubig = bigint;
export type ibig = bigint;
/* eslint-enable @typescript-eslint/naming-convention */

// Re-exporting types from @threema/ts-utils for structbuf-typescript
export type {u8, u53, WeakOpaque, ReadonlyUint8Array, EncoderPick, ByteLengthEncoder};
export type {OpaqueTag, TagOf, Bare, OpaquePick} from '@threema/ts-utils/meta/newtype';
export type {BoundedIterable} from '@threema/ts-utils/array/bounded-iterable';
export {tag} from '@threema/ts-utils/meta/newtype';

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

/**
 * Type guard for {@link u32}.
 */
export function isU32(val: unknown): val is u32 {
    return typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 0xffffffff;
}

/**
 * Ensure value is a valid {@link u32}.
 */
export function ensureU32(val: unknown): u32 {
    if (!isU32(val)) {
        throw new Error(`Number '${val}' is not a valid unsigned 32 bit integer`);
    }
    return val;
}

/**
 * Convert a u64 to a 53. Throw if the value is out of range.
 */
export function u64ToU53(val: u64): u53 {
    if (val < 0 || val > Number.MAX_SAFE_INTEGER) {
        throw new Error(`Value ${val} is not a valid integer in the u53 range`);
    }
    return Number(val);
}

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

/**
 * Pick all keys of T where the value matches U.
 */
export type PickKeysForType<T, U> = {
    [P in keyof T]: T[P] extends U ? P : never;
}[keyof T];

/**
 * From object T, make all properties K mutable.
 *
 * If K is not supplied, this is the inverse of {@link Readonly}.
 */
export type Mutable<T, K extends keyof T = keyof T> = Omit<T, K> & {-readonly [P in K]: T[P]};

// eslint-disable-next-line @typescript-eslint/no-restricted-types
export type Primitive = undefined | null | boolean | string | number | bigint;

/**
 * Definition of possible icon sets.
 */
export type IconSet = 'md-icon' | 'threema-icon';

/**
 * This type allows to verify at compile time that `TPartial` contains only properties from type
 * `T`, all optional. It's similar to recursively applying {@link Partial} while ensuring that no
 * extra keys are present.
 */
export type StrictPartial<TPartial, T extends TPartial> = TPartial extends object
    ? {
          [P in keyof TPartial]?: P extends keyof TPartial
              ? StrictPartial<TPartial[P], T[P]>
              : never;
      }
    : TPartial;

/**
 * Like {@link Extract} but ensures that all types provided in the union type U exist in type T.
 */
export type StrictExtract<T, U extends T> = Extract<T, U>;

/**
 * Like {@link Omit} but ensures that all keys provided in the union type U are keys of T.
 */
export type StrictOmit<T, U extends keyof T> = Omit<T, U>;

/**
 * A tuple containing `T` exactly `N` times.
 */
export type RepeatedTuple<T, N extends u53, R extends readonly T[] = []> = R['length'] extends N
    ? R
    : RepeatedTuple<T, N, readonly [T, ...R]>;

export interface DomainCertificatePin {
    /** The domain the certificates belong to (e.g. `*.example.com`). */
    readonly fqdn: string;

    /**
     * The match mode for the FQDN:
     *
     * - `exact`: The FQDN is matched literally against the request hostname (no wildcard
     *   expansion).
     * - `include-subdomains`: A leading `*` in the FQDN is expanded to match any single
     *   non-dot label, e.g. `*.example.com` matches `foo.example.com`.
     */
    readonly matchMode: 'exact' | 'include-subdomains';

    /**
     * The SPKI fingerprints (SHA-256-hashed and Base64-encoded public keys) of the certificates
     * that are whitelisted for the specified `domain`.
     */
    readonly spkis: readonly {
        readonly algorithm: 'sha256';
        readonly value: SpkiValue;
    }[];
}

const SPKI_VALUE_LENGTH = 32;

export type SpkiValue = WeakOpaque<ReadonlyUint8Array, {readonly SpkiValue: unique symbol}>;

/**
 * Type guard for {@link SpkiValue}.
 */
export function isSpkiValue(raw: unknown): raw is SpkiValue {
    return raw instanceof Uint8Array && raw.byteLength === SPKI_VALUE_LENGTH;
}

/**
 * Ensure input is a valid {@link SpkiValue}.
 *
 * @throws If the array is not a valid Spki Value
 */
export function ensureSpkiValue(spkiBytes: ReadonlyUint8Array): SpkiValue {
    if (!isSpkiValue(spkiBytes)) {
        throw new Error(
            `Expected spki value to be ${SPKI_VALUE_LENGTH} bytes but has ${spkiBytes.byteLength} bytes`,
        );
    }
    return spkiBytes;
}

/**
 * Dimensions (width and height) of a 2D object in pixels.
 */
export interface Dimensions {
    readonly height: u53;
    readonly width: u53;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const KiB = 1024;
// eslint-disable-next-line @typescript-eslint/naming-convention
export const MiB = 1024 * KiB;

/**
 * Represents a union of the `string` type with additional string literals while retaining all type
 * information (i.e., preventing it from collapsing the union into `string` and erasing the string
 * literals).
 *
 * @example
 * ```ts
 * type Example1 = string | "foo" | "bar" // string
 * type Example2 = StringOrLiteral<"foo" | "bar"> // string | "foo" | "bar"
 * ```
 */
export type StringOrLiteral<T extends string> = (string & NonNullable<unknown>) | T;
