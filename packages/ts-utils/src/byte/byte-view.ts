import type {u53} from '../integer/u53.js';

/**
 * Get a (different type of) view from a source view.
 *
 * @param class_ The view class we want to make an instance of.
 * @param source The source view to create a new view for.
 * @returns A view instance of type `class_` to the array with the exact same underlying buffer,
 *   offset and length.
 */
export function byteView<TView>(
    class_: new (buffer: ArrayBufferLike, byteOffset?: u53, byteLength?: u53) => TView,
    source: ArrayBufferView,
): TView {
    // eslint-disable-next-line new-cap
    return new class_(source.buffer, source.byteOffset, source.byteLength);
}
