/**
 * Controller for a transformation codec.
 *
 * Note: This must be compatible to {@link TransformStreamDefaultController}.
 * Spec: https://streams.spec.whatwg.org/#ts-default-controller-class
 */
export interface TransformerCodecController<O> {
    readonly enqueue: (chunk: O) => void;
}
