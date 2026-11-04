import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ExpiringValue} from './expiring-value.js';

describe('ExpiringValue', () => {
    beforeEach(() => {
        // Start the fake clock at the Unix epoch (`Date.now()` === 0) so that all `expiresAtMs`
        // values below are easy to reason about.
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('get', () => {
        it('returns undefined when no value was ever set', () => {
            const cache = new ExpiringValue<string>();
            expect(cache.get()).toBeUndefined();
        });

        it('returns the value while it is still valid', () => {
            const cache = new ExpiringValue<string>();
            cache.set('token', new Date(100_000));

            expect(cache.get()).toBe('token');

            // Still valid one millisecond before expiration.
            vi.advanceTimersByTime(99_999);
            expect(cache.get()).toBe('token');
        });

        it('returns the value at exactly the expiration boundary', () => {
            const cache = new ExpiringValue<string>();
            cache.set('token', new Date(100_000));

            // Expiry check is `expiresAtMs - minRemainingValidityMs < now`, so the value is still
            // returned when `now === expiresAtMs`.
            vi.advanceTimersByTime(100_000);
            expect(cache.get()).toBe('token');
        });

        it('returns undefined once the value has expired', () => {
            const cache = new ExpiringValue<string>();
            cache.set('token', new Date(100_000));

            // One millisecond past the expiration date.
            vi.advanceTimersByTime(100_001);
            expect(cache.get()).toBeUndefined();
        });

        it('keeps returning undefined once the value has expired', () => {
            const cache = new ExpiringValue<string>();
            cache.set('token', new Date(100_000));

            vi.advanceTimersByTime(100_001);
            // Repeated `get` calls are idempotent while the value stays expired.
            expect(cache.get()).toBeUndefined();
            expect(cache.get()).toBeUndefined();
        });

        describe('minRemainingValidityMs', () => {
            it('returns the value when it will remain valid for at least minRemainingValidityMs', () => {
                const cache = new ExpiringValue<string>();
                cache.set('token', new Date(100_000));

                // 40s elapsed, 60s of validity remain, and we require at least 10s.
                vi.advanceTimersByTime(40_000);
                expect(cache.get({minRemainingValidityMs: 10_000})).toBe('token');
            });

            it('returns undefined when the remaining validity is below minRemainingValidityMs', () => {
                const cache = new ExpiringValue<string>();
                cache.set('token', new Date(100_000));

                // 95s elapsed, only 5s of validity remain, but we require at least 10s.
                vi.advanceTimersByTime(95_000);
                expect(cache.get({minRemainingValidityMs: 10_000})).toBeUndefined();
            });

            it('treats the minRemainingValidityMs threshold as inclusive', () => {
                const cache = new ExpiringValue<string>();
                cache.set('token', new Date(100_000));

                // Exactly 10s of validity remain and we require 10s: `expiresAtMs -
                // minRemainingValidityMs < now` => `90_000 < 90_000` is false, so it is returned.
                vi.advanceTimersByTime(90_000);
                expect(cache.get({minRemainingValidityMs: 10_000})).toBe('token');
            });

            it('defaults to 0, reproducing the plain expiry behaviour', () => {
                const cache = new ExpiringValue<string>();
                cache.set('token', new Date(100_000));

                vi.advanceTimersByTime(100_000);
                // Explicit 0 and the default behave identically at the boundary.
                expect(cache.get({minRemainingValidityMs: 0})).toBe('token');
                expect(cache.get()).toBe('token');
            });

            it('does not evict a still-valid value on a minRemainingValidityMs miss', () => {
                const cache = new ExpiringValue<string>();
                cache.set('token', new Date(100_000));

                // 95s elapsed, only 5s of validity remain: a caller requiring 10s misses ...
                vi.advanceTimersByTime(95_000);
                expect(cache.get({minRemainingValidityMs: 10_000})).toBeUndefined();
                // ... but the value is still cached and valid, so a caller with a looser (or no)
                // requirement still gets it.
                expect(cache.get({minRemainingValidityMs: 5_000})).toBe('token');
                expect(cache.get()).toBe('token');
            });

            it('reports a cache miss when minRemainingValidityMs exceeds the total lifetime', () => {
                // Multiplier 1.0 => the value can never offer more than 100s of validity.
                const cache = new ExpiringValue<string>();
                cache.set('token', new Date(100_000));

                // Requesting more validity than the value can ever provide misses immediately, even
                // though it was just set and has not expired.
                expect(cache.get({minRemainingValidityMs: 150_000})).toBeUndefined();
                // The value is not evicted, so a satisfiable request still hits.
                expect(cache.get()).toBe('token');
            });
        });
    });

    describe('set', () => {
        it('returns the value that was passed in', () => {
            const cache = new ExpiringValue<string>();
            expect(cache.set('token', new Date(100_000))).toBe('token');
        });

        it('floors the computed expiration delta', () => {
            const cache = new ExpiringValue<string>();
            cache.set('token', new Date(2.25));

            vi.advanceTimersByTime(2);
            expect(cache.get()).toBe('token');

            vi.advanceTimersByTime(1);
            expect(cache.get()).toBeUndefined();
        });

        it('clamps a past expiration date to zero remaining validity', () => {
            const cache = new ExpiringValue<string>();
            vi.advanceTimersByTime(50_000);
            // Expiration in the past => negative delta clamped to 0, so no real validity.
            cache.set('token', new Date(10_000));

            // Requiring any positive validity fails immediately ...
            expect(cache.get({minRemainingValidityMs: 1})).toBeUndefined();
            // ... and it is gone on the very next millisecond.
            vi.advanceTimersByTime(1);
            expect(cache.get()).toBeUndefined();
        });

        it('overwrites a previously stored value and its expiration', () => {
            const cache = new ExpiringValue<string>();
            cache.set('old', new Date(10_000));
            cache.set('new', new Date(100_000));

            // Past the first expiration but well within the second.
            vi.advanceTimersByTime(50_000);
            expect(cache.get()).toBe('new');
        });
    });
});
