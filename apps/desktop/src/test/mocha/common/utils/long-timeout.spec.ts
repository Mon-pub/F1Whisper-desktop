import type {u53} from '@threema/ts-utils/integer/u53';
import {TIMER} from '@threema/ts-utils/timer/global-timer';
import {expect} from 'chai';
import {useFakeTimers} from 'sinon';

import disappearingMessageServiceSource from '~/common/dom/backend/disappearing-message-service.ts?raw';
import {longTimeout, MAX_TIMEOUT_CHUNK_DELAY_MS} from '~/common/utils/long-timeout';
import {ValueObject} from '~/common/utils/object';

/**
 * Remove line and block comments from TypeScript source, leaving string and template literals
 * intact, so structural pins cannot be satisfied (or tripped) by prose in a comment.
 */
function stripComments(source: string): string {
    let out = '';
    let i = 0;
    while (i < source.length) {
        const char = source[i] ?? '';
        const next = source[i + 1];
        if (char === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') {
                i += 1;
            }
        } else if (char === '/' && next === '*') {
            const endIndex = source.indexOf('*/', i + 2);
            i = endIndex === -1 ? source.length : endIndex + 2;
        } else if (char === "'" || char === '"' || char === '`') {
            const quote = char;
            out += char;
            i += 1;
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\') {
                    out += source[i] ?? '';
                    i += 1;
                }
                out += source[i] ?? '';
                i += 1;
            }
            out += quote;
            i += 1;
        } else {
            out += char;
            i += 1;
        }
    }
    return out;
}

/**
 * A call to a timer's plain `.timeout(` method (as opposed to `longTimeout(`).
 */
const BARE_TIMEOUT_CALL = /\.timeout\s*\(/u;

/**
 * Test of the fork-owned bounded long-delay timeout.
 */
export function run(): void {
    describe('utils::long-timeout', function () {
        describe('behaviour', function () {
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
                    longTimeout(TIMER, () => (fired.value += 1), 60_000);

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
                    longTimeout(TIMER, () => (fired.value += 1), MAX_TIMEOUT_CHUNK_DELAY_MS);
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
                        longTimeout(TIMER, () => (fired.value += 1), delayMs);

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
                    longTimeout(TIMER, () => (fired.value += 1), 0);
                    expect(fired.value, 'not synchronous').to.equal(0);
                    clock.tick(0);
                    expect(fired.value, 'fires on next tick').to.equal(1);
                });
            });

            it('can be cancelled before the first chunk fires', function () {
                withFakeClock((clock) => {
                    const fired = new ValueObject(0);
                    const cancel = longTimeout(TIMER, () => (fired.value += 1), 365 * DAY_MS);
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
                    const cancel = longTimeout(TIMER, () => (fired.value += 1), delayMs);

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

        // Structural pin (P-H01): the disappearing-message service derives its delay from a persisted,
        // originally peer-supplied expiry. Scheduling it through a bare `.timeout(` brings back the
        // overflow-to-immediate-fire hot loop, and nothing errors when that happens.
        describe('disappearing-message-service source pin', function () {
            const source = stripComments(disappearingMessageServiceSource);

            it('schedules the expiry through longTimeout', function () {
                expect(source).to.match(/\blongTimeout\s*\(\s*TIMER\b/u);
            });

            it('never schedules via a bare .timeout( call', function () {
                expect(source).to.not.match(BARE_TIMEOUT_CALL);
            });

            it('stripComments ignores prose in comments (red probe fixture)', function () {
                const commented = [
                    '// TIMER.timeout(() => undefined, 1);',
                    '/* TIMER.timeout(() => undefined, 1); */',
                    'longTimeout(TIMER, cb, 1);',
                ].join('\n');
                expect(stripComments(commented)).to.not.match(BARE_TIMEOUT_CALL);
                expect(stripComments(commented)).to.match(/longTimeout\(TIMER/u);
            });

            it('the bare-timeout pattern detects a real regression (red probe fixture)', function () {
                const regressed = 'this._c = TIMER.timeout(() => this.sweep(), delayMs);';
                expect(stripComments(regressed)).to.match(BARE_TIMEOUT_CALL);
            });

            it('stripComments keeps comment markers inside string literals', function () {
                const withUrl = "const url = 'http://x'; TIMER.timeout(cb, 1);";
                expect(stripComments(withUrl)).to.match(BARE_TIMEOUT_CALL);
            });
        });
    });
}
