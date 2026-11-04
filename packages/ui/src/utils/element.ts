// eslint-disable-next-line @typescript-eslint/no-restricted-types
export type WithElementRef<T, U extends Element = HTMLElement> = T & {ref?: U | null};
