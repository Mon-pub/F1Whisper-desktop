import type {SinkCodecController} from './sink-codec-controller.js';

/**
 * An asynchronous sink codec.
 *
 * Note: This must be compatible to {@link UnderlyingSink}.
 * Spec: https://streams.spec.whatwg.org/#underlying-sink-api
 */
export interface AsyncCodecSink<O> {
    readonly start?: (controller: SinkCodecController) => void | Promise<void>;
    readonly write: (chunk: O, controller: SinkCodecController) => Promise<void>;
    readonly close: () => void;
    readonly abort: (reason: Error) => void;
}
