/**
 * A synchronous transformation codec. Chained transformation codecs guarantee that a single
 * transformation chain completes before the next is initiated.
 *
 * Note: This cannot be chained with normal {@link Transformer}s without an adapter that bundles the
 * synchronous transformation codec chain into a single asynchronous transformation codec.
 */
export interface SyncTransformerCodec<I, O> {
    readonly start?: (forward: (chunk: O) => void) => void;
    readonly transform: (chunk: I, forward: (chunk: O) => void) => void;
}
