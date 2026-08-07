import type {DatabaseBackend, DbContactUid, DbGroupUid} from '~/common/db';
import {CspE2eContactControlType, CspE2eGroupControlType, GroupUserState} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Group} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
import {groupDebugString} from '~/common/model/group';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {OutgoingCspMessagesTask} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import {randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import {encodeDisappearingTimer} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import type {MessageId} from '~/common/network/types';
import type {u53} from '~/common/types';
import {UTF8} from '~/common/utils/codec';

type ServicesForOutgoingGroupDisappearingTimer = ServicesForTasks & {
    readonly db: Pick<
        DatabaseBackend,
        'deletePendingGroupDisappearingTimer' | 'hasPendingGroupDisappearingTimer'
    >;
};

type ServicesForOutgoingContactDisappearingTimer = ServicesForTasks & {
    readonly db: Pick<
        DatabaseBackend,
        'deletePendingContactDisappearingTimer' | 'hasPendingContactDisappearingTimer'
    >;
};

/**
 * F1Whisper fork: send a 1:1 disappearing-messages timer control message (CSP 0x85).
 *
 * Durable/serializable: re-queued on reconnect so an offline peer receives the timer change. The
 * body is a bare 4-byte LE uint32 `timerSeconds` (0 = off).
 */
export class OutgoingContactDisappearingTimerTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForOutgoingContactDisappearingTimer,
        private readonly _contactUid: DbContactUid,
        private readonly _timerSeconds: u53,
        private readonly _generation: u53,
        private readonly _messageId: MessageId,
        private readonly _createdAt: Date,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-contact-disappearing-timer`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const hasAuthority = (): boolean => this._hasAuthority(handle);
        if (!hasAuthority()) {
            return;
        }
        const receiver = this._services.model.contacts.getByUid(this._contactUid)?.get();
        if (receiver === undefined) {
            return;
        }
        this._log.debug(`Sending 1:1 disappearing-messages timer ${this._timerSeconds}s`);
        const sentMessages = await new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: receiver},
                // The same authority predicate guards initial execution and is handed to the codec,
                // which reevaluates it after CSP authentication and encoder backpressure.
                precondition: hasAuthority,
                sharedMessageProperties: {
                    messageId: this._messageId,
                    createdAt: this._createdAt,
                    allowUserProfileDistribution: false,
                },
                specifics: {
                    default: {
                        encoder: encodeDisappearingTimer(this._timerSeconds),
                        messageProperties: {
                            type: CspE2eContactControlType.CONTACT_DISAPPEARING_TIMER,
                            cspMessageFlags: CspMessageFlags.none(),
                        },
                    },
                },
            },
        ]).run(handle);
        if (sentMessages > 0) {
            this._services.db.deletePendingContactDisappearingTimer(
                this._contactUid,
                this._generation,
            );
        }
    }

    private _hasAuthority(handle: ActiveTaskCodecHandle<'persistent'>): boolean {
        if (
            !handle.controller.d2m.promotedToLeader.done ||
            !this._services.volatileProtocolState.isCspOriginator() ||
            !this._services.db.hasPendingContactDisappearingTimer(
                this._contactUid,
                this._generation,
            )
        ) {
            return false;
        }
        const contact = this._services.model.contacts.getByUid(this._contactUid)?.get();
        return (
            contact !== undefined &&
            contact.controller.conversation().get().view.ephemeralTimerSeconds ===
                this._timerSeconds
        );
    }
}

/**
 * F1Whisper fork: send a group disappearing-messages timer control message (CSP 0x95).
 *
 * The durable intent is stored by generation in `pendingGroupDisappearingTimers`; this task clears
 * only its matching generation after all CSP ACKs. The 4-byte LE uint32 `timerSeconds` body is
 * wrapped in a group-member container (8B creator + 8B group id + 4B timer).
 */
export class OutgoingGroupDisappearingTimerTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForOutgoingGroupDisappearingTimer,
        private readonly _groupUid: DbGroupUid,
        private readonly _timerSeconds: u53,
        private readonly _generation: u53,
    ) {
        const group = this._services.model.groups.getByUid(this._groupUid)?.get();
        const groupString =
            group === undefined
                ? `uid-${this._groupUid}`
                : groupDebugString(this._services.device.identity.string, group.view.groupId);
        this._log = this._services.logging.logger(
            `network.protocol.task.outgoing-group-disappearing-timer.${groupString}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        if (!handle.controller.d2m.promotedToLeader.done) {
            return;
        }
        const group = this._currentEligibleGroup();
        if (group === undefined) {
            return;
        }
        this._log.debug(`Sending group disappearing-messages timer ${this._timerSeconds}s`);
        const sentMessages = await new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: group},
                precondition: () =>
                    handle.controller.d2m.promotedToLeader.done &&
                    this._currentEligibleGroup() !== undefined,
                sharedMessageProperties: {
                    messageId: randomMessageId(this._services.crypto),
                    createdAt: new Date(),
                    allowUserProfileDistribution: false,
                    overrideReflectedProperty: false,
                },
                specifics: {
                    default: {
                        encoder: structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                            groupId: group.view.groupId,
                            creatorIdentity: UTF8.encode(
                                getIdentityString(this._services.device, group.view.creator),
                            ),
                            innerData: encodeDisappearingTimer(this._timerSeconds),
                        }),
                        messageProperties: {
                            type: CspE2eGroupControlType.GROUP_DISAPPEARING_TIMER,
                            cspMessageFlags: CspMessageFlags.none(),
                        },
                    },
                },
            },
        ]).run(handle);
        if (sentMessages > 0) {
            this._services.db.deletePendingGroupDisappearingTimer(this._groupUid, this._generation);
        }
    }

    /** Resolve the current group and terminally drop intent if this user can no longer send to it. */
    private _currentEligibleGroup(): Group | undefined {
        if (!this._services.db.hasPendingGroupDisappearingTimer(this._groupUid, this._generation)) {
            return undefined;
        }
        const group = this._services.model.groups.getByUid(this._groupUid)?.get();
        if (group === undefined || group.view.userState !== GroupUserState.MEMBER) {
            this._services.db.deletePendingGroupDisappearingTimer(this._groupUid, this._generation);
            return undefined;
        }
        return group;
    }
}
