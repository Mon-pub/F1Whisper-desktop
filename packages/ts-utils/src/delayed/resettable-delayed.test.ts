import {describe, expect, it} from 'vitest';

import {DelayedError} from './delayed-error.js';
import {ResettableDelayed} from './resettable-delayed.js';

describe('ResettableDelayed', () => {
    it('starts in the unset state', () => {
        const delayed = new ResettableDelayed<number>('counter');
        expect(delayed.isSet()).toBe(false);
    });

    it('throws a `DelayedError` on `unwrap` before set', () => {
        const delayed = new ResettableDelayed<number>('counter');
        try {
            delayed.unwrap();
            expect.fail('expected `unwrap` to throw');
        } catch (error) {
            expect(error).toBeInstanceOf(DelayedError);
            expect((error as DelayedError).type).toBe('get');
            expect((error as DelayedError).title).toBe('counter');
        }
    });

    it('returns the inner value after set', () => {
        const delayed = new ResettableDelayed<number>('counter');
        delayed.set(7);
        expect(delayed.isSet()).toBe(true);
        expect(delayed.unwrap()).toBe(7);
    });

    it('allows the value to be replaced after being set', () => {
        const delayed = new ResettableDelayed<number>('counter');
        delayed.set(1);
        delayed.set(2);
        expect(delayed.unwrap()).toBe(2);
    });
});
