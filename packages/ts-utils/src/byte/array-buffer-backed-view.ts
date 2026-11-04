/**
 * Type guard for {@link ArrayBuffer}, i.e. a buffer that is not a `SharedArrayBuffer`.
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
    return (
        value instanceof ArrayBuffer ||
        // Note: `instanceof` only compares against a single realm's prototype and therefore yields
        // a false negative for a buffer created in another realm (e.g. one that crossed Electron's
        // context bridge), so we need this additional check as a fallback.
        Object.prototype.toString.call(value) === '[object ArrayBuffer]'
    );
}

/**
 * Type guard for a view that is backed by an {@link ArrayBuffer} (and not a `SharedArrayBuffer`).
 */
export function isArrayBufferBackedView(value: unknown): value is ArrayBufferView<ArrayBuffer> {
    return ArrayBuffer.isView(value) && isArrayBuffer(value.buffer);
}

/**
 * Ensure a view is backed by an {@link ArrayBuffer} (and not a `SharedArrayBuffer`). See
 * {@link isArrayBufferBackedView}.
 */
export function ensureArrayBufferBackedView<TView extends ArrayBufferView>(
    view: TView,
): TView & ArrayBufferView<ArrayBuffer> {
    if (!isArrayBufferBackedView(view)) {
        throw new Error('Byte view is not backed by an ArrayBuffer');
    }
    return view;
}
