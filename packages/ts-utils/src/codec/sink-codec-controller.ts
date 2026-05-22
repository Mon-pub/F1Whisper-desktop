/**
 * Controller for a sink codec.
 *
 * Note: This must be compatible to {@link WritableStreamDefaultController}.
 * Spec: https://streams.spec.whatwg.org/#ts-default-controller-class
 */
export interface SinkCodecController {
    readonly error: (reason: Error) => void;
}
