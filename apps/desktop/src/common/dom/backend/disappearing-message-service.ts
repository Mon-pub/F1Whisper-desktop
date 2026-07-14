import type {DatabaseBackend, DbConversationUid} from '~/common/db';
import type {Logger, LoggerFactory} from '~/common/logging';
import type {Repositories} from '~/common/model';
import type {MessageId} from '~/common/network/types';
import {TIMER, type TimerCanceller} from '~/common/utils/timer';

/**
 * Services required by the {@link DisappearingMessageService}.
 */
export interface ServicesForDisappearingMessages {
    readonly logging: LoggerFactory;
    readonly model: Repositories;
    readonly db: Pick<DatabaseBackend, 'getMessagesDueForDeletion' | 'getNextMessageExpiry'>;
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
    private _nextTimerCanceller: TimerCanceller | undefined = undefined;
    /** Guards against re-entrant / overlapping sweeps double-deleting the same message. */
    private _sweeping = false;

    public constructor(private readonly _services: ServicesForDisappearingMessages) {
        this._log = _services.logging.logger('backend.disappearing-message-service');
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

    /** Cancel the pending single-shot timer (e.g. on shutdown). */
    public stop(): void {
        this._nextTimerCanceller?.();
        this._nextTimerCanceller = undefined;
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
        const delayMs = Math.max(0, next.getTime() - now.getTime());
        this._nextTimerCanceller = TIMER.timeout(() => {
            this._nextTimerCanceller = undefined;
            this.sweepExpiredMessages();
        }, delayMs);
    }
}
