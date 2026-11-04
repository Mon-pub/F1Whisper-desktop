// Taken from https://github.com/Microsoft/TypeScript/issues/4895
// Refinements inspired by https://github.com/gcanti/newtype-ts

/**
 * A generic tag.
 */
export interface OpaqueTag<UID> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    readonly __TAG__: UID;
}

/**
 * New-type with implicit conversion to the underlying type allowed.
 */
export type WeakOpaque<T, UID> = T & OpaqueTag<UID>;

/**
 * Retrieve the tag type from a new-type.
 */
export type TagOf<T> = [type: T] extends [newType: WeakOpaque<unknown, infer I>] ? I : never;

/**
 * Remove the new-type from a type.
 */
export type Bare<T> = T extends WeakOpaque<infer I, TagOf<T>> ? Omit<I, '__TAG__'> : T;

/**
 * Safely apply a new-type to a type.
 */
export function tag<T extends WeakOpaque<unknown, unknown>>(item: Bare<T>): T {
    return item as T;
}

/**
 * From a new-type object T, pick a set of properties by its keys K.
 */
export type OpaquePick<T extends WeakOpaque<unknown, TagOf<T>>, K extends keyof T> = Pick<
    T,
    K | keyof OpaqueTag<unknown>
>;
