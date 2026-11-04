import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';

/**
 * An object URL created via {@link createObjectUrlFromBytes}, bundled with the callback needed to
 * release it again.
 */
export interface RevocableObjectUrl {
    /**
     * The created object URL, suitable e.g. as the `src` of an `<img>` element.
     */
    readonly url: string;
    /**
     * Revokes {@link url} via `URL.revokeObjectURL`, releasing the underlying data.
     */
    readonly dispose: () => void;
}

/**
 * Create an object URL for the given binary source via `URL.createObjectURL`.
 *
 * IMPORTANT: The caller takes ownership of the returned object URL and **must** call
 * {@link RevocableObjectUrl.dispose} once the URL is no longer needed. Object URLs are not released
 * automatically, so failing to dispose leaks the URL and the memory backing it for the lifetime of
 * the document.
 *
 * @param source The binary source to create an object URL for.
 * @returns The created {@link RevocableObjectUrl}.
 */
export function createObjectUrlFromBytes(
    source: Blob | ReadonlyUint8Array | MediaSource,
): RevocableObjectUrl {
    const url =
        source instanceof Blob || source instanceof MediaSource
            ? URL.createObjectURL(source)
            : URL.createObjectURL(new Blob([new Uint8Array(source)]));

    return {
        dispose: () => {
            URL.revokeObjectURL(url);
        },
        url,
    };
}
