import type {u53} from '@threema/ts-utils/integer/u53';
import {ensureError} from '@threema/ts-utils/meta/ensure-error';
import {ResolvablePromise} from '@threema/ts-utils/promise/resolvable-promise';

import type {DbConversationUid, DbMessageUid} from '~/common/db';
import type {BlobBackend} from '~/common/network/protocol/blob';
import type {IQueryableStore} from '~/common/utils/store';

/**
 * F1Whisper fork: connection-independent coordination of outgoing message blob uploads.
 *
 * Problem this solves: the upload of a file message runs inside a persistent protocol task. A
 * reconnect re-runs that task from scratch while the first run is still awaiting its HTTP request,
 * and nothing ever cancelled that request. On a slow uplink this produced one more identical upload
 * per reconnect, none of which could finish.
 *
 * The coordinator makes every blob upload
 *
 * - single-flight: while an upload of a blob of a message is running, further callers for the same
 *   blob join it instead of starting another request, and
 * - cancellable: every upload owns an {@link AbortController}. It is aborted when the message is
 *   removed, and on quit or teardown. It is deliberately NOT aborted when the mediator connection
 *   drops: the upload is plain HTTP and does not depend on that connection.
 *
 * One coordinator exists per {@link BlobBackend} (see {@link getBlobUploadCoordinator}), i.e. per
 * backend, never per connection, so a reconnect cannot reset it.
 */

/**
 * Safety cap for a single upload request. The server ends every upload after 60 minutes, so this
 * only matters if that response never arrives (dead network path). It is set above the server bound
 * so the server's own, more specific refusal wins whenever both would fire.
 */
export const UPLOAD_MAX_DURATION_MS: u53 = 65 * 60 * 1000;

/**
 * What a coordinated operation of a message is: one of its two blob uploads, the wait before an
 * upload is retried, or the wait for a free upload slot (the waits are cancelled by exactly the
 * same triggers as an upload).
 */
export type BlobUploadKind = 'main' | 'thumbnail' | 'retry-wait' | 'slot-wait';

/**
 * Why uploads were cancelled.
 *
 * - `message-removed`: the message was deleted, disappeared, or its conversation was cleared or
 *   deleted. Nothing is left to send.
 * - `send-cancelled`: the message still exists but its send intent was invalidated (the
 *   conversation was cleared while the message is kept). Nothing is left to send either.
 * - `sibling-failed`: the other blob of the same message failed for good, so this one is pointless.
 *   Never the reason a message is reported with: the failure that caused it is.
 * - `quit`: the app is quitting (after the bounded graceful flush).
 * - `teardown`: the device is being unlinked or dropped.
 */
export type BlobUploadAbortReason =
    | 'message-removed'
    | 'send-cancelled'
    | 'sibling-failed'
    | 'quit'
    | 'teardown';

/**
 * An upload was cancelled on purpose (as opposed to failing). Never retried.
 *
 * Intentionally a plain {@link Error}: it never crosses a worker boundary.
 */
export class BlobUploadCancelledError extends Error {
    public constructor(public readonly reason: BlobUploadAbortReason) {
        super(`Blob upload cancelled (${reason})`);
        this.name = 'BlobUploadCancelledError';
    }
}

interface UploadEntry {
    readonly messageUid: DbMessageUid;
    readonly conversationUid: DbConversationUid | undefined;
    readonly controller: AbortController;
    readonly promise: Promise<unknown>;
}

export class BlobUploadCoordinator {
    private readonly _entries = new Map<string, UploadEntry>();

    /** Number of uploads currently in flight. */
    public get inFlightCount(): u53 {
        return this._entries.size;
    }

    /**
     * Run (or join) the upload of one blob of a message.
     *
     * The entry is registered synchronously, before {@link executor} starts, so a caller arriving at
     * any later point finds it. {@link executor} receives the signal it must honour and is
     * responsible for checkpointing its result; it must not write to a message that is no longer
     * active.
     *
     * @param messageActive Whether the message is still alive. Turning `false` cancels the upload
     *   with reason `message-removed`.
     * @param conversationUid The conversation of the message, so that all uploads of a conversation
     *   can be cancelled together ({@link abortConversation}).
     * @returns The result of the executor, shared by all callers for the same blob.
     * @throws {BlobUploadCancelledError} if the upload was cancelled on purpose, whatever error the
     *   transport reported for it.
     */
    public async run<T>(
        messageUid: DbMessageUid,
        kind: BlobUploadKind,
        messageActive: IQueryableStore<boolean>,
        executor: (signal: AbortSignal) => Promise<T>,
        conversationUid?: DbConversationUid,
    ): Promise<T> {
        const key = `${messageUid}:${kind}`;
        const existing = this._entries.get(key);
        if (existing !== undefined) {
            return (await existing.promise) as T;
        }

        const controller = new AbortController();
        // Re-read on every call: the signal can fire while the executor is awaiting.
        function isCancelled(): boolean {
            return controller.signal.aborted;
        }
        const promise = Promise.resolve().then(async () => {
            if (isCancelled()) {
                throw controller.signal.reason;
            }
            // A cancel must end the upload for every caller promptly, even if the transport is slow
            // to honour the signal; a late result of the executor is then ignored.
            const cancelled = new ResolvablePromise<never, Error>({uncaught: 'discard'});
            function onAbort(): void {
                cancelled.reject(ensureError(controller.signal.reason));
            }
            controller.signal.addEventListener('abort', onAbort, {once: true});
            try {
                return await Promise.race([executor(controller.signal), cancelled]);
            } catch (error) {
                // Whatever the transport reported, a deliberate cancel is reported as such.
                if (isCancelled()) {
                    throw controller.signal.reason;
                }
                throw error;
            } finally {
                controller.signal.removeEventListener('abort', onAbort);
            }
        });
        const entry: UploadEntry = {messageUid, conversationUid, controller, promise};
        this._entries.set(key, entry);

        const unsubscribe = messageActive.subscribe((active) => {
            if (!active) {
                this._abortEntry(entry, 'message-removed');
            }
        });
        try {
            return await promise;
        } finally {
            unsubscribe();
            // Only remove the entry this call owns.
            if (this._entries.get(key) === entry) {
                this._entries.delete(key);
            }
        }
    }

    /**
     * Cancel every in-flight upload of one message.
     */
    public abortMessage(messageUid: DbMessageUid, reason: BlobUploadAbortReason): void {
        for (const entry of [...this._entries.values()]) {
            if (entry.messageUid === messageUid) {
                this._abortEntry(entry, reason);
            }
        }
    }

    /**
     * Cancel every in-flight upload of one conversation.
     */
    public abortConversation(
        conversationUid: DbConversationUid,
        reason: BlobUploadAbortReason,
    ): void {
        for (const entry of [...this._entries.values()]) {
            if (entry.conversationUid === conversationUid) {
                this._abortEntry(entry, reason);
            }
        }
    }

    /**
     * Cancel every in-flight upload.
     */
    public abortAll(reason: BlobUploadAbortReason): void {
        for (const entry of [...this._entries.values()]) {
            this._abortEntry(entry, reason);
        }
    }

    private _abortEntry(entry: UploadEntry, reason: BlobUploadAbortReason): void {
        // The first reason wins: a later abort must not change what the signal reports.
        if (!entry.controller.signal.aborted) {
            entry.controller.abort(new BlobUploadCancelledError(reason));
        }
    }
}

const COORDINATORS = new WeakMap<BlobBackend, BlobUploadCoordinator>();

/**
 * Get the {@link BlobUploadCoordinator} that belongs to a blob backend (created on first use).
 *
 * Keyed by the backend object so that the coordinator lives exactly as long as the backend and is
 * shared by everything that uploads through it, without threading another service through the
 * model layer.
 */
export function getBlobUploadCoordinator(blob: BlobBackend): BlobUploadCoordinator {
    let coordinator = COORDINATORS.get(blob);
    if (coordinator === undefined) {
        coordinator = new BlobUploadCoordinator();
        COORDINATORS.set(blob, coordinator);
    }
    return coordinator;
}
