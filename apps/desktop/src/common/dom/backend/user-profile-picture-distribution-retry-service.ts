import type {u53} from '@threema/ts-utils/integer/u53';

import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model/types/common';
import {enrollPendingUserProfilePictureDistributions} from '~/common/network/protocol/task/common/user-profile-distribution';
import {OutgoingUserProfilePictureBroadcastTask} from '~/common/network/protocol/task/csp/outgoing-user-profile-picture-broadcast';
import {schedulePendingUserProfileSync} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync-transaction';

/**
 * Recovers durable D2D profile sync and per-recipient CSP profile-picture actions.
 *
 * Each path re-plans from current state. Independent in-flight tracking prevents startup/periodic
 * triggers from duplicating a generation; generation-matched cleanup keeps old tasks from clearing
 * newer D2D or per-contact intent.
 */
export class UserProfilePictureDistributionRetryService {
    private readonly _inFlightGenerations = new Set<u53>();
    private readonly _log: Logger;

    public constructor(private readonly _services: ServicesForModel) {
        this._log = _services.logging.logger('backend.user-profile-picture-distribution-retry');
    }

    /** Retry durable intent without duplicate in-flight generations. */
    public retryPending(): void {
        try {
            this._retryPendingProfileSync();
        } catch (error) {
            this._log.error(`Pending D2D user-profile sync recovery failed: ${error}`);
        }
        try {
            // Reconstruct intent authoritatively before scanning. This closes a crash window between
            // committing profile/privacy state and enrolling all recipients, while preserving rows
            // already owned by queued or in-flight retries.
            enrollPendingUserProfilePictureDistributions(this._services, {
                preserveExisting: true,
            });
            for (const pending of this._services.persistentProtocolState.getPendingUserProfileDistributions()) {
                if (this._inFlightGenerations.has(pending.generation)) {
                    continue;
                }
                this._inFlightGenerations.add(pending.generation);
                let scheduled: Promise<unknown>;
                try {
                    scheduled = this._services.taskManager.schedule(
                        new OutgoingUserProfilePictureBroadcastTask(this._services, {
                            receiverIdentity: pending.receiverIdentity,
                            pendingGeneration: pending.generation,
                        }),
                    );
                } catch (error) {
                    this._inFlightGenerations.delete(pending.generation);
                    this._log.warn(
                        `Could not queue pending profile-picture distribution to ${pending.receiverIdentity}: ${error}`,
                    );
                    continue;
                }
                void scheduled
                    .catch((error: unknown) => {
                        // Keep durable intent for the next leader/periodic attempt.
                        this._log.warn(
                            `Pending profile-picture distribution to ${pending.receiverIdentity} failed: ${error}`,
                        );
                    })
                    .finally(() => {
                        this._inFlightGenerations.delete(pending.generation);
                    });
            }
        } catch (error) {
            this._log.error(`Pending profile-picture distribution recovery failed: ${error}`);
        }
    }

    /** Recover the independent singleton D2D profile-sync intent. */
    private _retryPendingProfileSync(): void {
        const pending = this._services.persistentProtocolState.getPendingUserProfileSync();
        if (pending === undefined) {
            return;
        }
        schedulePendingUserProfileSync(this._services, pending.generation, this._log);
    }
}
