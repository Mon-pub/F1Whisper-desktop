import * as adapter from '@mattiasbuelens/web-streams-adapter';
import type {ReadableStream, WritableStream} from 'web-streams-polyfill/polyfill';

/**
 * A bidirectional stream is simply an interface that has both a readable and
 * a writable stream.
 */
export interface BidirectionalStream<R, W> {
    readonly readable: ReadableStream<R>;
    readonly writable: WritableStream<W>;
}

// Re-export. This allows us to easily switch or conditionally drop parts of
// the polyfill.
export * from 'web-streams-polyfill';
export {adapter};
