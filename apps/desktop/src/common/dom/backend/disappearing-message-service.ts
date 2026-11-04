import {TIMER} from '@threema/ts-utils/timer/global-timer';
import type {TimerCanceller} from '@threema/ts-utils/timer/timer-canceller';

import type {DatabaseBackend, DbConversationUid} from '~/common/db';
import type {Logger, LoggerFactory} from '~/common/logging';
import type {Repositories} from '~/common/model';
import type {MessageId} from '~/common/network/types';
import type {EventController, EventUnsubscriber} from '~/common/utils/event';
import {longTimeout} from '~/common/utils/long-timeout';

/**
 * Services required by the {@link DisappearingMessageService}.
 */
export interface ServicesForDisappearingMessages {
    readonly logging: LoggerFactory;
    readonly model: Repositories;
    readonly db: Pick<DatabaseBackend, 'getMessagesDueForDeletion' | 'getNextMessageExpiry'>;
    /**
     * F1Whisper fork (P-H05): raised by the model when a disappearing expiry is (re)stamped; the
     * service re-arms its deletion timer on it. Optional so tests can omit it.
     */
    readonly disappearingRefresh?: EventController<void>;
}

/**
 * F1Whisper fork: enforcement engine for disappearing messages.
 *
 * - Deletes all messages whose `expiresAt <= now` (soft-delete via the model, same UX as a deleted
 *   message; blobs are cleared too).
 * - Arms a precise single-shot {@link TIMER} for the nearest future expiry, so messages disappear
 *   promptly between periodic sweeps.
 * - The periodic sweep is registered as a {@link BackgroundJobScheduler} recurring job by the
 *   backend; its first run (at startup) recovers any messages that expired while the app was closed.
 *
 * Enforcement is LOCAL only. The cross-member timer sync is the CSP disappearing-timer control
 * message (decoded/persisted on receive, sent on change), not this engine.
 */
export class DisappearingMessageService {
    private readonly _log: Logger;
    private readonly _unsubscribeRefresh: EventUnsubscriber | undefined;
    private _nextTimerCanceller: TimerCanceller | undefined = undefined;
    /** Guards against re-entrant / overlapping sweeps double-deleting the same message. */
    private _sweeping = false;

    public constructor(private readonly _services: ServicesForDisappearingMessages) {
        this._log = _services.logging.logger('backend.disappearing-message-service');
        // F1Whisper fork (P-H05): re-arm the deletion timer immediately when the model stamps a new
        // expiry (e.g. an inbound message is first-read), instead of waiting for the periodic sweep.
        this._unsubscribeRefresh = _services.disappearingRefresh?.subscribe(() =>
            this.rescheduleNextTimer(),
        );
    }

    /**
     * Delete every message whose disappearing expiry is due (`expiresAt <= now`), then re-arm the
     * single-shot timer for the next pending expiry. Safe to call repeatedly and concurrently (a
     * concurrent call is skipped).
     */
    public sweepExpiredMessages(log: Logger = this._log): void {
        if (this._sweeping) {
            return;
        }
        this._sweeping = true;
        try {
            const now = new Date();
            const due = this._services.db.getMessagesDueForDeletion(now);
            if (due.length > 0) {
                log.info(`Disappearing-messages sweep: deleting ${due.length} expired message(s)`);
            }
            for (const {conversationUid, id} of due) {
                this._deleteMessage(conversationUid, id, now, log);
            }
        } catch (error) {
            log.error(`Disappearing-messages sweep failed: ${error}`);
        } finally {
            this._sweeping = false;
            this._armNextTimer();
        }
    }

    /**
     * (Re)arm the single-shot timer for the nearest pending expiry. Called after every sweep, and
     * after a message is stamped (via {@link rescheduleNextTimer}).
     */
    public rescheduleNextTimer(): void {
        this._armNextTimer();
    }

    /** Cancel the pending single-shot timer and the refresh subscription (e.g. on shutdown). */
    public stop(): void {
        this._nextTimerCanceller?.();
        this._nextTimerCanceller = undefined;
        this._unsubscribeRefresh?.();
    }

    private _deleteMessage(
        conversationUid: DbConversationUid,
        messageId: MessageId,
        deletedAt: Date,
        log: Logger,
    ): void {
        const conversation = this._services.model.conversations.getByUid(conversationUid);
        if (conversation === undefined) {
            return;
        }
        try {
            conversation.get().controller.markMessageAsDisappeared(messageId, deletedAt);
        } catch (error) {
            log.warn(`Failed to disappear message ${messageId}: ${error}`);
        }
    }

    private _armNextTimer(): void {
        // Cancel any previously-armed timer first.
        this._nextTimerCanceller?.();
        this._nextTimerCanceller = undefined;

        const now = new Date();
        const next = this._services.db.getNextMessageExpiry(now);
        if (next === undefined) {
            return;
        }

        // Clamp to a non-negative delay; if `next` is already in the past (a race), sweep again.
        //
        // Use the bounded long-delay helper, not a raw `TIMER.timeout`: `next` is derived from a
        // persisted (and originally peer-supplied) expiry, so `delayMs` can exceed the ~24.855-day
        // ceiling at which a single `setTimeout` silently overflows and fires immediately. A raw
        // timeout there would re-query this same future row and re-arm the same invalid delay in a
        // hot loop that survives restart (P-H01). `longTimeout` schedules bounded chunks instead.
        const delayMs = Math.max(0, next.getTime() - now.getTime());
        this._nextTimerCanceller = longTimeout(
            TIMER,
            () => {
                this._nextTimerCanceller = undefined;
                this.sweepExpiredMessages();
            },
            delayMs,
        );
    }
}
