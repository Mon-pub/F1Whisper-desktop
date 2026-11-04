import type {u8} from '../integer/u8.js';

// eslint-disable-next-line @typescript-eslint/no-restricted-types
type Primitive = undefined | null | boolean | string | number | bigint;

/**
 * Transform each Y of T (being an object or tuple) into X depending on the
 * mode M.
 */
type IntoXIfYMap<T, Y, M extends 'args' | 'args+return', X> = {
    readonly [K in keyof T]: IntoXIfY<T[K], Y, M, X>;
};

/**
 * Transform each Y of T into X depending on the mode M.
 *
 * This allows to find and replace field and function (argument and return)
 * types on an interface.
 */
type IntoXIfY<T, Y, M extends 'args' | 'args+return', X> = T extends Y
    ? X
    : T extends Primitive | IterableIterator<unknown>
      ? T
      : T extends (...args: infer A) => infer R
        ? (
              ...args: M extends 'args' | 'args+return' ? IntoXIfYMap<A, Y, M, X> : A
          ) => M extends 'args+return' ? IntoXIfY<R, Y, M, X> : R
        : IntoXIfYMap<T, Y, M, X>;

/**
 * Uint8Array methods that do not modify the underlying data including those
 * that return views into the data.
 */
type ReadonlyUint8ArrayMethods = Pick<
    Uint8Array,
    // From lib.es5.d.ts
    | 'BYTES_PER_ELEMENT'
    | 'byteLength'
    | 'byteOffset'
    | 'every'
    | 'find'
    | 'findIndex'
    | 'forEach'
    | 'indexOf'
    | 'join'
    | 'lastIndexOf'
    | 'length'
    | 'some'
    | 'subarray'
    | 'toLocaleString'
    | 'toString'
    // From lib.es2015.iterable.d.ts
    | 'entries'
    | 'keys'
    | 'values'
    // From lib.es2016.array.include.d.ts
    | 'includes'
>;

/**
 * Uint8Array methods that do not modify the underlying data and return a
 * copy of the (mutated) data.
 */
type CopyUint8ArrayMethods = Pick<
    Uint8Array,
    // From lib.es5.d.ts
    'filter' | 'map' | 'slice'
>;

/**
 * A read-only {@link Uint8Array}.
 */
export type ReadonlyUint8Array = {
    readonly [K in keyof ReadonlyUint8ArrayMethods]: IntoXIfY<
        ReadonlyUint8ArrayMethods[K],
        Uint8Array,
        'args+return',
        ReadonlyUint8Array
    >;
} & {
    readonly [K in keyof CopyUint8ArrayMethods]: IntoXIfY<
        CopyUint8ArrayMethods[K],
        Uint8Array,
        'args',
        ReadonlyUint8Array
    >;
} & {
    /* eslint-disable @typescript-eslint/member-ordering */
    // From lib.es5.d.ts
    readonly [index: number]: number;
    // Note: This is necessary for other types such as `BufferSource` to be assignable to `ReadonlyUint8Array`
    // Only access this buffer if you know what you are doing.
    readonly buffer: ArrayBufferLike;
    readonly valueOf: () => Uint8Array;
    reduce: <U>(
        callbackfn: (
            previousValue: U,
            currentValue: number,
            currentIndex: number,
            array: ReadonlyUint8Array,
        ) => U,
        initialValue: U,
    ) => U;
    reduceRight: <U>(
        callbackfn: (
            previousValue: U,
            currentValue: number,
            currentIndex: number,
            array: ReadonlyUint8Array,
        ) => U,
        initialValue: U,
    ) => U;
    // From lib.es2015.iterable.d.ts
    readonly [Symbol.iterator]: () => IterableIterator<u8>;
    // From lib.es2015.symbol.wellknown.d.ts
    readonly [Symbol.toStringTag]: 'Uint8Array';
    /* eslint-enable @typescript-eslint/member-ordering */
};
