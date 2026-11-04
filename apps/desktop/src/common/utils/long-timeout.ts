import type {u53} from '@threema/ts-utils/integer/u53';
import type {Timer} from '@threema/ts-utils/timer/global-timer';
import type {TimerCallback} from '@threema/ts-utils/timer/timer-callback';
import type {TimerCanceller} from '@threema/ts-utils/timer/timer-canceller';

/**
 * F1Whisper fork: maximum delay (ms) safe to pass to the platform `setTimeout` in a single call.
 *
 * `setTimeout` stores its delay in a signed 32-bit int internally (both Node and Chromium). A delay
 * above `2^31 - 1` (2_147_483_647 ms, ~24.855 days) overflows that int and the browser/runtime fires
 * the callback almost immediately instead of after the requested delay -- silently wrong, not an
 * error. This constant is comfortably under that ceiling so a single chunk can never overflow.
 */
export const MAX_TIMEOUT_CHUNK_DELAY_MS: u53 = 2_000_000_000; // ~23.1 days

/**
 * F1Whisper fork: like `Timer.timeout`, but safe for arbitrarily long delays -- in particular a
 * delay computed from a persisted future timestamp (e.g. a disappearing-message expiry) that can
 * exceed the ~24.855-day ceiling a single `setTimeout` call silently overflows at (see
 * {@link MAX_TIMEOUT_CHUNK_DELAY_MS}).
 *
 * Schedules in bounded chunks of at most {@link MAX_TIMEOUT_CHUNK_DELAY_MS}, re-deriving the
 * remaining delay from the wall clock before each chunk (anchored to an absolute due timestamp,
 * not a decrementing counter) so real elapsed time -- not just chunk count -- determines when the
 * callback fires; this also self-corrects for any per-chunk scheduling drift instead of
 * compounding it. Never passes a raw delay above {@link MAX_TIMEOUT_CHUNK_DELAY_MS} to the
 * underlying `setTimeout`, so a delay derived from an unbounded or malicious input (e.g. a
 * received wire timer) can never overflow into an immediate-fire hot loop. Cancellable at any
 * point, including between chunks.
 *
 * This is a free function (not a `Timer` method) because the upstream `Timer` lives in
 * `packages/ts-utils`, which must not carry fork code.
 *
 * @param timer The timer used to schedule each bounded chunk.
 * @param callback The callback to be called once the full delay has elapsed.
 * @param delayMs Amount of milliseconds to wait. May be arbitrarily large.
 * @returns A function that allows cancelling the timer (any pending chunk).
 */
export function longTimeout(
    timer: Pick<Timer, 'timeout'>,
    callback: TimerCallback,
    delayMs: u53,
): TimerCanceller {
    const dueAt = Date.now() + delayMs;
    let cancelled = false;
    let cancelCurrentChunk: TimerCanceller | undefined;

    function canceller(): void {
        cancelled = true;
        cancelCurrentChunk?.();
    }

    function scheduleNextChunk(): void {
        if (cancelled) {
            return;
        }
        const remainingMs = Math.max(0, dueAt - Date.now());
        const chunkMs = Math.min(remainingMs, MAX_TIMEOUT_CHUNK_DELAY_MS);
        cancelCurrentChunk = timer.timeout(() => {
            if (cancelled) {
                return;
            }
            if (Date.now() >= dueAt) {
                callback(canceller);
            } else {
                scheduleNextChunk();
            }
        }, chunkMs);
    }

    scheduleNextChunk();
    return canceller;
}
