import {describe, expect, it} from 'vitest';

import {TimeoutError} from './timeout-error.js';

describe('TimeoutError', () => {
    it('is an `Error` instance', () => {
        expect(new TimeoutError(100)).toBeInstanceOf(Error);
    });

    it('formats the message with the timeout in milliseconds', () => {
        expect(new TimeoutError(250).message).toBe('Timer timed out after 250ms');
    });
});
