import type {Logger} from '~/common/logging';
import {
    type OutboxRecoveryResult,
    recoverOutgoingMessageOutbox,
} from '~/common/model/outgoing-message-outbox';
import type {ServicesForModel} from '~/common/model/types/common';

/**
 * F1Whisper fork (P-H12): startup recovery for the durable outgoing-message outbox.
 *
 * Reconstructs a send task for every durable outbox entry whose message was not confirmed
 * transmitted before the last quit/crash/profile switch. Runs once, at backend startup (invoked from
 * `Backend._scheduleBackgroundJobs`). Idempotent: only the first {@link recover} call acts, so a
 * second startup-jobs pass (there are two backend creation paths) does not re-schedule the same
 * messages.
 */
export class OutgoingMessageOutboxRecoveryService {
    private readonly _log: Logger;
    private _recovered = false;

    public constructor(private readonly _services: ServicesForModel) {
        this._log = _services.logging.logger('backend.outgoing-message-outbox-recovery');
    }

    /**
     * Reconstruct send tasks for surviving durable outbox entries. Only the first call acts.
     */
    public recover(): OutboxRecoveryResult {
        if (this._recovered) {
            return {recovered: 0, dropped: 0};
        }
        this._recovered = true;
        return recoverOutgoingMessageOutbox(this._services, this._log);
    }
}
