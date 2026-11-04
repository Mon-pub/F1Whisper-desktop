import type {u53} from '@threema/ts-utils/integer/u53';
import {ensureError} from '@threema/ts-utils/meta/ensure-error';

import {BlobBackendError} from '~/common/network/protocol/blob';
import {BlobUploadCancelledError} from '~/common/network/protocol/f1-blob-upload-coordinator';

/**
 * F1Whisper fork: what to do when uploading the blob of an outgoing message fails.
 *
 * The blob server refuses uploads for a handful of well-known reasons. Some of them are
 * temporary (the server is busy, the link stalled) and are retried with a backoff; the others
 * cannot be fixed by trying again and end the send at once. Nothing here ever throws into the
 * protocol task manager: the caller decides, and a deterministic refusal would otherwise be an
 * endless reconnect-and-retry loop.
 */

/**
 * Why an upload was given up on. Shown to the user (transiently, it is not stored).
 *
 * - `too-slow`: the server cut the upload because it took longer than the server allows.
 * - `too-large`: the server refused the size.
 * - `storage-full`: the server cannot take files right now.
 * - `failed`: anything else (a local read failure, or the retry budget ran out).
 */
export type UploadFailureReason = 'too-slow' | 'too-large' | 'storage-full' | 'failed';

export type UploadFailureClass =
    | {readonly kind: 'retry'}
    | {readonly kind: 'terminal'; readonly reason: UploadFailureReason}
    /** The upload was cancelled on purpose; nothing to classify. */
    | {readonly kind: 'cancelled'};

const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_INSUFFICIENT_STORAGE = 507;

/** The text the server sends with a 408 when the whole upload took too long (not just stalled). */
const TOO_SLOW_BODY = /too slow/iu;

/**
 * Classify the error of a failed upload attempt.
 *
 * | condition | class |
 * | --- | --- |
 * | cancelled on purpose | cancelled |
 * | no HTTP status (network error, token failure, safety time cap) | retry |
 * | 408 `upload too slow` | terminal `too-slow` |
 * | 408 `upload stalled` or any other 408 | retry |
 * | 413 | terminal `too-large` |
 * | 507 | terminal `storage-full` |
 * | 429, 503, other 5xx, and every other status | retry (within the retry budget) |
 * | anything that is not a blob backend error (e.g. the local file cannot be read) | terminal `failed` |
 */
export function classifyUploadFailure(error: unknown): UploadFailureClass {
    if (!(error instanceof BlobBackendError)) {
        return {kind: 'terminal', reason: 'failed'};
    }
    if (error.type === 'aborted') {
        return {kind: 'cancelled'};
    }
    switch (error.status) {
        case HTTP_REQUEST_TIMEOUT:
            return error.body !== undefined && TOO_SLOW_BODY.test(error.body)
                ? {kind: 'terminal', reason: 'too-slow'}
                : {kind: 'retry'};
        case HTTP_PAYLOAD_TOO_LARGE:
            return {kind: 'terminal', reason: 'too-large'};
        case HTTP_INSUFFICIENT_STORAGE:
            return {kind: 'terminal', reason: 'storage-full'};
        default:
            return {kind: 'retry'};
    }
}

/**
 * Cumulative budget of scheduled backoff (60 minutes) a message may spend on retrying failures
 * where a server ANSWERED (any HTTP status, or an unusable answer). Each such retry charges its
 * backoff delay; once the next delay would exceed the budget the failure is terminal.
 *
 * It counts scheduled delays, not wall-clock time, so a laptop that sleeps or a clock jump cannot
 * use it up. Failures where no server answered (offline, DNS, connection refused or reset, TLS,
 * our own time cap) are never charged: such a message keeps waiting for connectivity, exactly like
 * text messages, instead of being failed after an hour offline.
 */
export const RETRY_BUDGET_MS: u53 = 60 * 60 * 1000;

/**
 * Whether the failure is a transport failure: the request got no answer from any server. Only
 * blob backend errors can be one (anything else is already terminal).
 */
export function isTransportFailure(error: unknown): boolean {
    return error instanceof BlobBackendError && !error.responded;
}

/** Delays before the first retries. Every retry after the last step waits as long as the last step. */
const BACKOFF_STEPS_MS: readonly u53[] = [5_000, 15_000, 60_000];

/** Each delay is spread by up to this fraction in both directions, so retries do not synchronize. */
const BACKOFF_JITTER_RATIO = 0.2;

/**
 * Delay before retry number {@link retryIndex} (0 for the first retry): 5 s, 15 s, 60 s, then 60 s
 * every time, each spread by +-20%.
 *
 * @param random Source of randomness in `[0, 1)`; injectable for tests.
 */
export function backoffDelayMs(retryIndex: u53, random: () => number = Math.random): u53 {
    const base = BACKOFF_STEPS_MS[Math.min(retryIndex, BACKOFF_STEPS_MS.length - 1)] ?? 60_000;
    const spread = (random() * 2 - 1) * BACKOFF_JITTER_RATIO;
    return Math.round(base * (1 + spread));
}

/**
 * Sleep for {@link ms}, ending early with the abort reason if {@link signal} fires.
 */
export async function abortableSleep(ms: u53, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        throw ensureError(signal.reason);
    }
    await new Promise<void>((resolve, reject) => {
        function onAbort(): void {
            clearTimeout(timer);
            reject(ensureError(signal.reason));
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, {once: true});
    });
}

/**
 * Choose the failure to report when the blob uploads of one message failed (both blobs can fail
 * differently). The precedence does not depend on which blob failed first or which is main:
 *
 * 1. a deliberate cancel (the message is gone, quit, ...), because nothing is left to report;
 * 2. a TERMINAL failure (413, 507, too slow, local), because it ends the send and a retry of the
 *    other blob's temporary error would only delay the same end;
 * 3. a retryable failure where a server answered (it is charged to the retry budget, so it must
 *    not be hidden by a transport failure of the other blob);
 * 4. a retryable transport failure (no answer);
 * 5. a cancel that only says "the sibling blob failed", which is never the real reason.
 */
export function pickPrimaryFailure(failures: readonly unknown[]): unknown {
    function isSiblingCancel(failure: unknown): boolean {
        return failure instanceof BlobUploadCancelledError && failure.reason === 'sibling-failed';
    }
    const cancel = failures.find(
        (failure) => failure instanceof BlobUploadCancelledError && !isSiblingCancel(failure),
    );
    if (cancel !== undefined) {
        return cancel;
    }
    const real = failures.filter((failure) => !(failure instanceof BlobUploadCancelledError));
    return (
        real.find((failure) => classifyUploadFailure(failure).kind === 'terminal') ??
        // Keep the evidence that spends the retry budget: a retryable failure where a server
        // answered is reported before one where nothing answered.
        real.find((failure) => !isTransportFailure(failure)) ??
        real[0] ??
        failures[0]
    );
}
