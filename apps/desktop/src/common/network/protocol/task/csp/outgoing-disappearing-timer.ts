import {CspE2eContactControlType, CspE2eGroupControlType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact, Group} from '~/common/model';
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
import type {u53} from '~/common/types';
import {UTF8} from '~/common/utils/codec';

/**
 * F1Whisper fork: send a 1:1 disappearing-messages timer control message (CSP 0x85).
 *
 * Durable/serializable: re-queued on reconnect so an offline peer receives the timer change. The
 * body is a bare 4-byte LE uint32 `timerSeconds` (0 = off).
 */
export class OutgoingContactDisappearingTimerTask<TReceiver extends Contact>
    implements ActiveTask<void, 'persistent'>
{
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _receiver: TReceiver,
        private readonly _timerSeconds: u53,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-contact-disappearing-timer`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        this._log.debug(`Sending 1:1 disappearing-messages timer ${this._timerSeconds}s`);
        await new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._receiver},
                sharedMessageProperties: {
                    messageId: randomMessageId(this._services.crypto),
                    createdAt: new Date(),
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
    }
}

/**
 * F1Whisper fork: send a group disappearing-messages timer control message (CSP 0x95).
 *
 * Durable/serializable. The 4-byte LE uint32 `timerSeconds` body is wrapped in a group-member
 * container (so the wire layout is 8B creator + 8B group id + 4B timer).
 */
export class OutgoingGroupDisappearingTimerTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _group: Group,
        private readonly _timerSeconds: u53,
    ) {
        const groupString = groupDebugString(
            this._services.device.identity.string,
            this._group.view.groupId,
        );
        this._log = this._services.logging.logger(
            `network.protocol.task.outgoing-group-disappearing-timer.${groupString}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        this._log.debug(`Sending group disappearing-messages timer ${this._timerSeconds}s`);
        await new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._group},
                sharedMessageProperties: {
                    messageId: randomMessageId(this._services.crypto),
                    createdAt: new Date(),
                    allowUserProfileDistribution: false,
                    overrideReflectedProperty: false,
                },
                specifics: {
                    default: {
                        encoder: structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                            groupId: this._group.view.groupId,
                            creatorIdentity: UTF8.encode(
                                getIdentityString(this._services.device, this._group.view.creator),
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
    }
}
