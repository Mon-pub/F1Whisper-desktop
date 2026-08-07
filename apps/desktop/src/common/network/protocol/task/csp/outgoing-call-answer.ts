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
export type OutgoingCallAnswerTaskResult = 'sent' | 'follower-mode' | 'discarded';

export class OutgoingCallAnswerTask
    implements ActiveTask<OutgoingCallAnswerTaskResult, 'volatile'>
{
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _receiver: Contact,
        private readonly _payload: CallAnswerPayload,
        private readonly _precondition: () => boolean = () => true,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-call-answer.${this._payload.callId}`,
        );
    }

    public async run(
        handle: ActiveTaskCodecHandle<'volatile'>,
    ): Promise<OutgoingCallAnswerTaskResult> {
        // F1Whisper fork (P-H13 / FU-H09): a linked FOLLOWER (non-leader) desktop must not
        // ACCEPT/join a call. It cannot ring in the first place (incoming offers are gated), so this
        // is an unreachable backstop. Report the expected denial as data so it cannot terminate the
        // protocol task loop; the call manager tears down the fake connecting state. A
        // standalone/leader device is always promoted (`done` true) and is unaffected. A REJECT is
        // left to pass through.
        const hasAcceptAuthority = (): boolean =>
            this._payload.action !== O2oCallAnswerAction.ACCEPT ||
            (handle.controller.d2m.promotedToLeader.done &&
                this._services.volatileProtocolState.isCspOriginator());
        if (this._payload.action === O2oCallAnswerAction.ACCEPT && !this._precondition()) {
            return 'discarded';
        }
        if (!hasAcceptAuthority()) {
            this._log.warn(
                `Refusing to accept a call from a linked follower (callId=${this._payload.callId})`,
            );
            return 'follower-mode';
        }
        this._log.debug(
            `Sending call-answer (callId=${this._payload.callId}, action=${this._payload.action})`,
        );

        const messageTask = new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._receiver},
                precondition: () =>
                    hasAcceptAuthority() &&
                    (this._payload.action !== O2oCallAnswerAction.ACCEPT || this._precondition()),
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
        if (this._payload.action === O2oCallAnswerAction.ACCEPT && !this._precondition()) {
            return 'discarded';
        }
        return hasAcceptAuthority() ? 'sent' : 'follower-mode';
    }
}
