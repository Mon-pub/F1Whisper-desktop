import type {CodecReadResult} from './codec-read-result.js';

/**
 * Reader for a codec.
 *
 * Note: This must be compatible to {@link ReadableStreamDefaultReader}
 * Spec: https://streams.spec.whatwg.org/#default-reader-class
 */
export interface CodecReader<I> {
    readonly closed: Promise<void>;
    readonly read: () => Promise<CodecReadResult<I>>;
    readonly cancel: (reason: Error) => Promise<void>;
}
