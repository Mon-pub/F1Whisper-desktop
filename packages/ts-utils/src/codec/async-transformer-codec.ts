import type {TransformerCodecController} from './transformer-codec-controller.js';

/**
 * A transformation codec.
 *
 * Note: This must be compatible to {@link Transformer}.
 * Spec: https://streams.spec.whatwg.org/#transformer-api
 */
export interface AsyncTransformerCodec<I, O> {
    readonly start?: (controller: TransformerCodecController<O>) => void | Promise<void>;
    readonly transform: (
        chunk: I,
        controller: TransformerCodecController<O>,
    ) => void | Promise<void>;
}
