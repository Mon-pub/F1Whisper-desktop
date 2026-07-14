import {CspE2eGroupStatusUpdateType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Group} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
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
import {encodeGroupTyping} from '~/common/network/structbuf/validate/csp/e2e/group-typing';

/**
 * F1Whisper fork: send a group-typing indicator (CSP 0x84) to a group.
 *
 * Ephemeral (no server queue/ack), like the 1:1 typing indicator. The raw 17-byte body is
 * 8B creator identity + 8B group id + 1B typing flag (not wrapped in a group-member container).
 */
export class OutgoingGroupTypingIndicatorTask implements ActiveTask<void, 'volatile'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _group: Group,
        private readonly _isTyping: boolean,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-group-typing-indicator`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.debug(`Sending group typing indicator '${this._isTyping ? 1 : 0}'`);
        const creatorIdentity = getIdentityString(this._services.device, this._group.view.creator);
        await new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._group},
                sharedMessageProperties: {
                    messageId: randomMessageId(this._services.crypto),
                    createdAt: new Date(),
                    allowUserProfileDistribution: false,
                },
                specifics: {
                    default: {
                        encoder: encodeGroupTyping(
                            creatorIdentity,
                            this._group.view.groupId,
                            this._isTyping,
                        ),
                        messageProperties: {
                            type: CspE2eGroupStatusUpdateType.GROUP_TYPING,
                            cspMessageFlags: CspMessageFlags.fromPartial({
                                dontQueue: true,
                                dontAck: true,
                            }),
                        },
                    },
                },
            },
        ]).run(handle);
    }
}
