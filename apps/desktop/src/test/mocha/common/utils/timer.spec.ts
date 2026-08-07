import {expect} from 'chai';
import {useFakeTimers} from 'sinon';

import type {u53} from '~/common/types';
import {ValueObject} from '~/common/utils/object';
import {ResolvablePromise} from '~/common/utils/resolvable-promise';
import {MAX_TIMEOUT_CHUNK_DELAY_MS, TIMER} from '~/common/utils/timer';
import {expectCondition} from '~/test/mocha/common/utils';

/**
 * Test map utils.
 */
export function run(): void {
    describe('utils::timer', function () {
        describe('microtask', function () {
            it('schedules correctly', async function () {
                const result: u53[] = [];
                const done = new ResolvablePromise<void>({uncaught: 'default'});
                result.push(1);
                TIMER.microtask(() => {
                    result.push(3);
                    done.resolve();
                });
                result.push(2);
                await done;
                expect(result).to.deep.equal([1, 2, 3]);
            });
        });

        describe('debounce', function () {
            it('actually debounces function calls', async function () {
                const callCounter = new ValueObject(0);
                const debouncedIncrementCounter = TIMER.debounce(
                    () => (callCounter.value += 1),
                    30,
                );
                expect(callCounter.value, 'initial').to.equal(0);
                debouncedIncrementCounter();
                debouncedIncrementCounter();
                await TIMER.sleep(10);
                debouncedIncrementCounter();
                expect(callCounter.value, 'before wait time').to.equal(0);
                await expectCondition(() => callCounter.value > 0, 'call counter increased', 5, 50);
                expect(callCounter.value, 'final').to.equal(1);
            });

            it('calls debounced function with latest arguments', async function () {
                const argumentTracker = new ValueObject<undefined | string>(undefined);
                const debounced = TIMER.debounce(
                    (arg: string) => (argumentTracker.value = arg),
                    20,
                );
                expect(argumentTracker.value, 'initial').to.be.undefined;
                debounced('hello');
                debounced('big');
                debounced('world');
                await expectCondition(
                    () => argumentTracker.value !== undefined,
                    'argument is not undefined',
                    2,
                    50,
                );
                expect(argumentTracker.value, 'final').to.equal('world');
            });
        });

        describe('longTimeout', function () {
            const START_MS = 1_000_000;
            const DAY_MS = 24 * 60 * 60 * 1000;

            /**
             * Install fake timers, run `test`, and always restore. Sinon's fake timers replace both
             * `Date` and `setTimeout`, so `longTimeout`'s wall-clock re-derivation and its chunk
             * scheduling are fully driven by `clock`.
             */
            function withFakeClock(test: (clock: ReturnType<typeof useFakeTimers>) => void): void {
                const clock = useFakeTimers({now: START_MS});
                try {
                    test(clock);
                } finally {
                    clock.restore();
                }
            }

            /**
             * Walk the chunk timeline of an armed `longTimeout` by firing one scheduled timer at a
             * time, recording each chunk's delay (ms) from the fake clock, until the callback fires.
             * Asserts exactly one chunk is pending at any moment (no fan-out) and that the chunk
             * count never runs away.
             */
            function collectChunkDelays(
                clock: ReturnType<typeof useFakeTimers>,
                fired: ValueObject<u53>,
            ): u53[] {
                const chunkDelays: u53[] = [];
                while (fired.value === 0) {
                    expect(clock.countTimers(), 'exactly one chunk pending at a time').to.equal(1);
                    const before = clock.now;
                    clock.next();
                    chunkDelays.push(clock.now - before);
                    expect(chunkDelays.length, 'chunk count stays bounded').to.be.at.most(100);
                }
                return chunkDelays;
            }

            it('fires a within-limit delay in a single exact chunk', function () {
                withFakeClock((clock) => {
                    const fired = new ValueObject(0);
                    TIMER.longTimeout(() => (fired.value += 1), 60_000);

                    // Nothing fires without clock advancement.
                    expect(fired.value, 'no synchronous fire').to.equal(0);
                    expect(clock.countTimers(), 'one timer armed').to.equal(1);

                    // Not before the due time, then exactly at it.
                    clock.tick(59_999);
                    expect(fired.value, 'not before due').to.equal(0);
                    clock.tick(1);
                    expect(fired.value, 'fires at due').to.equal(1);
                });
            });

            it('fires a delay exactly at the chunk limit in a single chunk', function () {
                withFakeClock((clock) => {
                    const fired = new ValueObject(0);
                    TIMER.longTimeout(() => (fired.value += 1), MAX_TIMEOUT_CHUNK_DELAY_MS);
                    const chunkDelays = collectChunkDelays(clock, fired);
                    expect(chunkDelays).to.deep.equal([MAX_TIMEOUT_CHUNK_DELAY_MS]);
                    expect(fired.value).to.equal(1);
                });
            });

            // The review's mandated boundary values (P-H01 / U-H03): 25 days, four weeks, one year.
            // Each MUST schedule only bounded chunks (never a raw >2^31-1 ms delay handed to
            // `setTimeout`), must not fire without the clock advancing, and must fire exactly once at
            // the due time.
            for (const {label, delayMs} of [
                {label: '25 days', delayMs: 25 * DAY_MS},
                {label: 'four weeks', delayMs: 28 * DAY_MS},
                {label: 'one year', delayMs: 365 * DAY_MS},
            ]) {
                it(`schedules "${label}" as bounded chunks and fires once at expiry`, function () {
                    withFakeClock((clock) => {
                        const fired = new ValueObject(0);
                        TIMER.longTimeout(() => (fired.value += 1), delayMs);

                        // No callback loop without clock advancement, and only one bounded timer.
                        expect(fired.value, 'no fire without clock advancement').to.equal(0);
                        expect(clock.countTimers(), 'one bounded timer').to.equal(1);

                        const chunkDelays = collectChunkDelays(clock, fired);

                        // Fired exactly once, at the due time (not earlier).
                        expect(fired.value, 'fired exactly once').to.equal(1);
                        expect(clock.now, 'fires at the due time').to.equal(START_MS + delayMs);

                        // Every chunk stayed within the safe bound, and the count is the minimum.
                        for (const chunk of chunkDelays) {
                            expect(chunk, 'each chunk is bounded').to.be.at.most(
                                MAX_TIMEOUT_CHUNK_DELAY_MS,
                            );
                        }
                        expect(chunkDelays.length, 'no redundant chunks').to.equal(
                            Math.ceil(delayMs / MAX_TIMEOUT_CHUNK_DELAY_MS),
                        );

                        // Advancing further never fires again.
                        clock.tick(delayMs);
                        expect(fired.value, 'fires only once').to.equal(1);
                    });
                });
            }

            it('fires a zero delay asynchronously on the next tick', function () {
                withFakeClock((clock) => {
                    const fired = new ValueObject(0);
                    TIMER.longTimeout(() => (fired.value += 1), 0);
                    expect(fired.value, 'not synchronous').to.equal(0);
                    clock.tick(0);
                    expect(fired.value, 'fires on next tick').to.equal(1);
                });
            });

            it('can be cancelled before the first chunk fires', function () {
                withFakeClock((clock) => {
                    const fired = new ValueObject(0);
                    const cancel = TIMER.longTimeout(() => (fired.value += 1), 365 * DAY_MS);
                    expect(clock.countTimers()).to.equal(1);
                    cancel();
                    expect(clock.countTimers(), 'pending chunk cleared').to.equal(0);
                    clock.tick(2 * 365 * DAY_MS);
                    expect(fired.value, 'never fires after cancel').to.equal(0);
                });
            });

            it('can be cancelled between chunks', function () {
                withFakeClock((clock) => {
                    const fired = new ValueObject(0);
                    const delayMs = 3 * MAX_TIMEOUT_CHUNK_DELAY_MS;
                    const cancel = TIMER.longTimeout(() => (fired.value += 1), delayMs);

                    // Fire the first chunk; the second is armed but the callback has not fired.
                    clock.next();
                    expect(fired.value, 'not fired mid-way').to.equal(0);
                    expect(clock.countTimers(), 'next chunk armed').to.equal(1);

                    cancel();
                    expect(clock.countTimers(), 'no chunk left after cancel').to.equal(0);
                    clock.tick(delayMs);
                    expect(fired.value, 'never fires after cancel').to.equal(0);
                });
            });
        });
    });
}
