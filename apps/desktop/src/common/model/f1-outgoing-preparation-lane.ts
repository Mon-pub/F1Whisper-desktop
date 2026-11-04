import type {u53} from '@threema/ts-utils/integer/u53';
import {ensureError} from '@threema/ts-utils/meta/ensure-error';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';

import type {DbConversationUid} from '~/common/db';
import type {BlobBackend} from '~/common/network/protocol/blob';
import {backoffDelayMs, RETRY_BUDGET_MS} from '~/common/network/protocol/f1-blob-upload-failure';

/**
 * F1Whisper fork: the ordered preparation lane for outgoing conversation messages.
 *
 * A file message must have its blobs uploaded before its send task can run. Doing that inside the
 * protocol task stalls the whole task manager (and the decoder behind it) for as long as the upload
 * takes, so on a slow link a single upload starves the connection's own echo replies and every
 * inbound message. The lane moves the upload OUT of the task manager:
 *
 * - Every outgoing message goes through the lane before its send task is scheduled.
 * - Jobs of one conversation run strictly one after the other, so the order in which messages were
 *   composed is the order in which their send tasks are scheduled (a text sent after a large file
 *   still goes out after it). Different conversations do not wait for each other.
 * - Jobs that upload hold an upload slot while they upload. The number of concurrent uploads is
 *   bounded and at most one large upload runs at a time, because every upload keeps a multiple of
 *   its size in memory (plain bytes, ciphertext, request body).
 * - A job that fails or throws never blocks the jobs behind it.
 * - The lane knows how much work is still pending, so a graceful shutdown can wait for it
 *   ({@link OutgoingPreparationLane.drain}) and can stop it from starting new work
 *   ({@link OutgoingPreparationLane.shutdown}).
 *
 * This file only holds the generic mechanics. What a job does (upload, then schedule the send task)
 * is in `f1-outgoing-message-dispatch.ts`.
 */

/** Uploads running at the same time, across all conversations. */
export const MAX_CONCURRENT_UPLOADS: u53 = 3;

/** An upload larger than this (in bytes) counts as large. */
export const LARGE_UPLOAD_BYTES: u53 = 16 * 1024 * 1024;

/** Large uploads running at the same time. */
export const MAX_CONCURRENT_LARGE_UPLOADS: u53 = 1;

/** Timing of upload retries (see {@link OutgoingPreparationLane.retryTiming}). */
export interface RetryTiming {
    /** Delay before retry number `retryIndex` (0 for the first retry). */
    readonly backoffMs: (retryIndex: u53) => u53;
    /** Cumulative backoff a message may spend on retrying failures where a server answered. */
    readonly budgetMs: u53;
}

interface SlotWaiter {
    readonly large: boolean;
    readonly grant: () => void;
}

/** Gives a held upload slot back. Safe to call more than once. */
export type ReleaseUploadSlot = () => void;

export class OutgoingPreparationLane {
    /**
     * How retries of failed uploads are timed. A test hook: tests replace it with tiny delays and a
     * fake clock; production keeps the defaults of `f1-blob-upload-failure.ts`.
     */
    public retryTiming: RetryTiming = {
        backoffMs: (retryIndex) => backoffDelayMs(retryIndex),
        budgetMs: RETRY_BUDGET_MS,
    };

    private readonly _tails = new Map<DbConversationUid, Promise<void>>();
    private readonly _idleWaiters = new Set<() => void>();
    private readonly _slotWaiters: SlotWaiter[] = [];
    private readonly _conversations = new Map<
        DbConversationUid,
        {pending: u53; retrying: boolean}
    >();
    private _runningUploads: u53 = 0;
    private _runningLargeUploads: u53 = 0;
    private _shutdown = false;

    /**
     * Number of jobs that were enqueued and have not finished yet (running or waiting).
     *
     * Jobs of a conversation whose head is only waiting before an upload retry are NOT counted: that
     * wait can last up to the retry budget, and a graceful shutdown must not sit through it (the
     * durable outbox resumes such a message on the next launch).
     */
    public get pendingCount(): u53 {
        let count = 0;
        for (const conversation of this._conversations.values()) {
            if (!conversation.retrying) {
                count += conversation.pending;
            }
        }
        return count;
    }

    /** Whether {@link shutdown} was called. */
    public get isShutdown(): boolean {
        return this._shutdown;
    }

    /**
     * Tell the lane that the head job of {@link conversation} is (not any more) just waiting before
     * an upload retry.
     */
    public setRetryWait(conversation: DbConversationUid, waiting: boolean): void {
        const state = this._conversations.get(conversation);
        if (state !== undefined) {
            state.retrying = waiting;
            this._notifyIdle();
        }
    }

    /**
     * Enqueue a job behind the jobs already queued for the same conversation.
     *
     * If nothing is queued for the conversation, the job starts synchronously, so a message that
     * needs no upload is handed to the task manager in the same tick as before the lane existed.
     *
     * @param run The job. It should not throw; if it does, {@link onError} is called and the jobs
     *   behind it still run.
     */
    public enqueue(
        conversation: DbConversationUid,
        run: () => Promise<void>,
        onError: (error: unknown) => void,
    ): void {
        const state = this._conversations.get(conversation) ?? {pending: 0, retrying: false};
        state.pending += 1;
        this._conversations.set(conversation, state);
        const previous = this._tails.get(conversation);
        async function execute(): Promise<void> {
            try {
                await run();
            } catch (error) {
                onError(error);
            }
        }
        const tail: Promise<void> = (
            previous === undefined ? execute() : previous.then(execute)
        ).then(() => {
            state.pending -= 1;
            if (state.pending === 0) {
                this._conversations.delete(conversation);
            }
            if (this._tails.get(conversation) === tail) {
                this._tails.delete(conversation);
            }
            this._notifyIdle();
        });
        this._tails.set(conversation, tail);
    }

    /**
     * Run {@link fn} while holding an upload slot. Waits (without blocking anything else) until a
     * slot is free.
     *
     * @param bytes Size of what {@link fn} is going to upload; decides whether it counts as large.
     */
    public async withUploadSlot<T>(bytes: u53, fn: () => Promise<T>): Promise<T> {
        const release = await this.acquireUploadSlot(bytes);
        try {
            return await fn();
        } finally {
            release();
        }
    }

    /**
     * Wait for an upload slot and take it. The caller must call the returned function when done.
     *
     * Waiting can be cancelled: when {@link signal} fires, the waiter is removed from the queue at
     * once (so it can never be granted a slot it would not release) and the promise rejects with the
     * signal's reason. If the slot was granted just before, it is given back.
     *
     * @param bytes Size of what is going to be uploaded; decides whether it counts as large.
     */
    public async acquireUploadSlot(bytes: u53, signal?: AbortSignal): Promise<ReleaseUploadSlot> {
        const large = bytes > LARGE_UPLOAD_BYTES;
        // Re-read on every call: the signal can fire while this waits.
        function isAborted(): boolean {
            return signal?.aborted === true;
        }
        if (isAborted()) {
            throw ensureError(signal?.reason);
        }
        if (this._canStart(large)) {
            this._take(large);
            return this._releaseOnce(large);
        }
        const release = await new Promise<ReleaseUploadSlot>((resolve, reject) => {
            const waiter: SlotWaiter = {
                large,
                grant: () => {
                    signal?.removeEventListener('abort', onAbort);
                    this._take(large);
                    resolve(this._releaseOnce(large));
                },
            };
            function onAbort(): void {
                reject(ensureError(signal?.reason));
            }
            this._slotWaiters.push(waiter);
            signal?.addEventListener(
                'abort',
                () => {
                    const index = this._slotWaiters.indexOf(waiter);
                    if (index !== -1) {
                        this._slotWaiters.splice(index, 1);
                    }
                    onAbort();
                },
                {once: true},
            );
        });
        // Aborted between the grant and this continuation: do not hold the slot for a cancelled job.
        if (isAborted()) {
            release();
            throw ensureError(signal?.reason);
        }
        return release;
    }

    /**
     * Stop the lane from starting new work. Jobs that already run finish; the owner is expected to
     * abort their uploads. Used when the app is going away.
     */
    public shutdown(): void {
        this._shutdown = true;
    }

    /**
     * Wait until every enqueued job has finished or {@link timeoutMs} elapsed.
     *
     * @returns The number of jobs still pending (`0` = the lane is drained).
     */
    public async drain(timeoutMs: u53): Promise<u53> {
        if (this.pendingCount === 0) {
            return 0;
        }
        const idle = new ResolvablePromise<void>({uncaught: 'discard'});
        function onIdle(): void {
            idle.resolve();
        }
        this._idleWaiters.add(onIdle);
        const timedOut = new ResolvablePromise<void>({uncaught: 'discard'});
        const timer = setTimeout(() => timedOut.resolve(), timeoutMs);
        try {
            await Promise.race([idle, timedOut]);
        } finally {
            clearTimeout(timer);
            this._idleWaiters.delete(onIdle);
        }
        return this.pendingCount;
    }

    private _notifyIdle(): void {
        if (this.pendingCount > 0) {
            return;
        }
        for (const waiter of [...this._idleWaiters]) {
            waiter();
        }
    }

    private _canStart(large: boolean): boolean {
        return (
            this._runningUploads < MAX_CONCURRENT_UPLOADS &&
            (!large || this._runningLargeUploads < MAX_CONCURRENT_LARGE_UPLOADS)
        );
    }

    private _releaseOnce(large: boolean): ReleaseUploadSlot {
        let released = false;
        return () => {
            if (!released) {
                released = true;
                this._release(large);
            }
        };
    }

    private _take(large: boolean): void {
        this._runningUploads += 1;
        if (large) {
            this._runningLargeUploads += 1;
        }
    }

    private _release(large: boolean): void {
        this._runningUploads -= 1;
        if (large) {
            this._runningLargeUploads -= 1;
        }
        // Hand freed slots to waiters in arrival order, skipping a large waiter while a large
        // upload is running so a small one behind it is not blocked for no reason.
        for (let index = 0; index < this._slotWaiters.length; ) {
            const waiter = this._slotWaiters[index];
            if (waiter !== undefined && this._canStart(waiter.large)) {
                this._slotWaiters.splice(index, 1);
                waiter.grant();
            } else {
                index += 1;
            }
        }
    }
}

const LANES = new WeakMap<BlobBackend, OutgoingPreparationLane>();

/**
 * Get the {@link OutgoingPreparationLane} that belongs to a backend (created on first use).
 *
 * Keyed by the blob backend object, like the upload coordinator, so there is exactly one lane per
 * backend (never one per connection) without threading a new service through the model layer.
 */
export function getOutgoingPreparationLane(blob: BlobBackend): OutgoingPreparationLane {
    let lane = LANES.get(blob);
    if (lane === undefined) {
        lane = new OutgoingPreparationLane();
        LANES.set(blob, lane);
    }
    return lane;
}
