import type {SourceCodecController} from './source-codec-controller.js';

/**
 * An asynchronous source codec.
 *
 * Note: This must be compatible to {@link UnderlyingSource}.
 * Spec: https://streams.spec.whatwg.org/#underlying-source-api
 */
export interface AsyncCodecSource<I> {
    start?: (controller: SourceCodecController<I>) => void | Promise<void>;
    pull: (controller: SourceCodecController<I>) => PromiseLike<void>;
    cancel: (reason: Error) => void;
}
