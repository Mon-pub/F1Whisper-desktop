/**
 * A handle to the `enqueue` function of a compatible codec.
 */
export interface CodecEnqueuer<O> {
    readonly enqueue: (chunk: O) => void;
}
