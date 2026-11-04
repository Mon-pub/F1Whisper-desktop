import type {u53} from '../integer/u53.js';

/**
 * Error raised when a timeout occurs.
 */
export class TimeoutError extends Error {
    public constructor(timeoutMs: u53) {
        super(`Timer timed out after ${timeoutMs}ms`);
    }
}
