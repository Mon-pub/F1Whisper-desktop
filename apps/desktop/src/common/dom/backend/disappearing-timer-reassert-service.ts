import type {Logger} from '~/common/logging';
import {
    recoverPendingContactDisappearingTimers,
    recoverPendingGroupDisappearingTimers,
} from '~/common/model/disappearing-timer-reassert';
import type {ServicesForModel} from '~/common/model/types/common';
import type {u53} from '~/common/types';

/**
 * Leader-gated recovery of durable contact and group disappearing-timer intent.
 */
export class DisappearingTimerReassertService {
    private readonly _log: Logger;
    private readonly _inFlightContactGenerations = new Set<u53>();
    private readonly _inFlightGroupGenerations = new Set<u53>();

    public constructor(private readonly _services: ServicesForModel) {
        this._log = _services.logging.logger('backend.disappearing-timer-reassert');
    }

    /** Handle every transition to leader. */
    public onLeaderTransition(): void {
        this.retryPendingContacts();
        this.retryPendingGroups();
    }

    /** Retry all durable intent without queuing duplicate generations. */
    public retryPending(): void {
        this.retryPendingContacts();
        this.retryPendingGroups();
    }

    /** Retry durable contact intent while remaining leader. */
    public retryPendingContacts(): void {
        try {
            recoverPendingContactDisappearingTimers(
                this._services,
                this._log,
                this._inFlightContactGenerations,
            );
        } catch (error) {
            this._log.error(`Pending contact disappearing-timer recovery failed: ${error}`);
        }
    }

    /** Retry durable group intent while remaining leader, without queuing duplicate generations. */
    public retryPendingGroups(): void {
        try {
            recoverPendingGroupDisappearingTimers(
                this._services,
                this._log,
                this._inFlightGroupGenerations,
            );
        } catch (error) {
            this._log.error(`Pending group disappearing-timer recovery failed: ${error}`);
        }
    }
}
