import {CspE2eConversationType, O2oCallAnswerAction} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact} from '~/common/model';
import {
    encodeCallAnswer,
    type CallAnswerPayload,
} from '~/common/network/protocol/call/o2o-call-signaling';
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

/**
 * Send an outgoing `call-answer` (0x61) to {@link _receiver}: either accepting (with an SDP
 * answer) or rejecting (with a reason) an incoming call.
 */
export class OutgoingCallAnswerTask implements ActiveTask<void, 'volatile'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _receiver: Contact,
        private readonly _payload: CallAnswerPayload,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-call-answer.${this._payload.callId}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.debug(
            `Sending call-answer (callId=${this._payload.callId}, action=${this._payload.action})`,
        );

        const messageTask = new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._receiver},
                sharedMessageProperties: {
                    messageId: randomMessageId(this._services.crypto),
                    createdAt: new Date(),
                    // Only distribute the user profile when accepting (per the structbuf docs:
                    // "Only if accepted").
                    allowUserProfileDistribution:
                        this._payload.action === O2oCallAnswerAction.ACCEPT,
                },
                specifics: {
                    default: {
                        encoder: structbuf.bridge.encoder(structbuf.csp.e2e.CallAnswer, {
                            answer: encodeCallAnswer(this._payload),
                        }),
                        messageProperties: {
                            type: CspE2eConversationType.CALL_ANSWER,
                            cspMessageFlags: CspMessageFlags.fromPartial({
                                sendPushNotification: true,
                                immediateDeliveryRequired: true,
                            }),
                        },
                    },
                },
            },
        ]);

        await messageTask.run(handle);
    }
}
