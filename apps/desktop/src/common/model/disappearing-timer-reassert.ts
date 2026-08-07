import {GroupUserState} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model/types/common';
import {
    OutgoingContactDisappearingTimerTask,
    OutgoingGroupDisappearingTimerTask,
} from '~/common/network/protocol/task/csp/outgoing-disappearing-timer';
import type {u53} from '~/common/types';

/**
 * Recover only durable, genuine local contact timer changes. Existing shared values are never
 * scanned or reconstructed as local intent.
 */
export function recoverPendingContactDisappearingTimers(
    services: ServicesForModel,
    log: Logger,
    inFlightGenerations?: Set<u53>,
): u53 {
    let count = 0;
    for (const pending of services.db.getPendingContactDisappearingTimers()) {
        if (services.model.contacts.getByUid(pending.contactUid) === undefined) {
            // The foreign key normally cascades this row with its contact. If the model is
            // temporarily unavailable, retain intent rather than treating it as acknowledged.
            continue;
        }
        if (inFlightGenerations?.has(pending.generation) === true) {
            continue;
        }
        inFlightGenerations?.add(pending.generation);
        const scheduled = services.taskManager.schedule(
            new OutgoingContactDisappearingTimerTask(
                services,
                pending.contactUid,
                pending.timerSeconds,
                pending.generation,
                pending.messageId,
                pending.createdAt,
            ),
        );
        void scheduled
            .catch(() => {
                // Keep the durable generation for the next reconnect/leader transition.
            })
            .finally(() => {
                inFlightGenerations?.delete(pending.generation);
            });
        count += 1;
    }
    if (count > 0) {
        log.info(`Recovered ${count} pending contact disappearing-timer change(s)`);
    }
    return count;
}

/**
 * PR3-M04: recover only durable, genuine local group timer changes. This deliberately does not scan
 * current group timer values: an arbitrary existing value must never be reasserted as local intent.
 * Safe on every leader transition; generation-matched ACK cleanup makes duplicate recovery bounded.
 */
export function recoverPendingGroupDisappearingTimers(
    services: ServicesForModel,
    log: Logger,
    inFlightGenerations?: Set<u53>,
): u53 {
    let count = 0;
    for (const pending of services.db.getPendingGroupDisappearingTimers()) {
        const group = services.model.groups.getByUid(pending.groupUid)?.get();
        if (group === undefined || group.view.userState !== GroupUserState.MEMBER) {
            services.db.deletePendingGroupDisappearingTimer(pending.groupUid, pending.generation);
            continue;
        }
        if (inFlightGenerations?.has(pending.generation) === true) {
            continue;
        }
        inFlightGenerations?.add(pending.generation);
        const scheduled = services.taskManager.schedule(
            new OutgoingGroupDisappearingTimerTask(
                services,
                pending.groupUid,
                pending.timerSeconds,
                pending.generation,
            ),
        );
        void scheduled
            .catch(() => {
                // Keep the durable generation for the next reconnect/leader transition.
            })
            .finally(() => {
                inFlightGenerations?.delete(pending.generation);
            });
        count += 1;
    }
    if (count > 0) {
        log.info(`Recovered ${count} pending group disappearing-timer change(s)`);
    }
    return count;
}
