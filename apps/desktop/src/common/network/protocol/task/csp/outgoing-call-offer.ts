import {CspE2eConversationType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact} from '~/common/model';
import {
    encodeCallOffer,
    type CallOfferPayload,
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
 * Send an outgoing `call-offer` (0x60) to {@link _receiver}, initiating a 1:1 call.
 *
 * Mirrors `OutgoingTypingIndicatorTask`'s shape (a single-message `OutgoingCspMessagesTask` call);
 * unlike typing indicators, `call-offer` IS queued/acked/reflected (see `MESSAGE_TYPE_PROPERTIES`).
 */
export type OutgoingCallOfferTaskResult = 'sent' | 'follower-mode' | 'discarded';

export class OutgoingCallOfferTask implements ActiveTask<OutgoingCallOfferTaskResult, 'volatile'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _receiver: Contact,
        private readonly _payload: CallOfferPayload,
        private readonly _precondition: () => boolean = () => true,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-call-offer.${this._payload.callId}`,
        );
    }

    public async run(
        handle: ActiveTaskCodecHandle<'volatile'>,
    ): Promise<OutgoingCallOfferTaskResult> {
        // F1Whisper fork (P-H13 / FU-H09): a linked FOLLOWER (non-leader) desktop must not place
        // calls. Call initiation is blocked in the UI for followers; this guards a race/edge so no
        // offer ever leaves a follower. Report the expected denial as data so it cannot terminate the
        // protocol task loop; the call manager tears down the fake ringing state and maps it to the
        // user-visible follower result. A standalone/leader device is always promoted (`done` is
        // true), so this never triggers there.
        const hasAuthority = (): boolean =>
            handle.controller.d2m.promotedToLeader.done &&
            this._services.volatileProtocolState.isCspOriginator();
        if (!this._precondition()) {
            return 'discarded';
        }
        if (!hasAuthority()) {
            this._log.warn(
                `Refusing to send call-offer from a linked follower (callId=${this._payload.callId})`,
            );
            return 'follower-mode';
        }
        this._log.debug(`Sending call-offer (callId=${this._payload.callId})`);

        const messageTask = new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._receiver},
                precondition: () => hasAuthority() && this._precondition(),
                sharedMessageProperties: {
                    messageId: randomMessageId(this._services.crypto),
                    createdAt: new Date(),
                    allowUserProfileDistribution: true,
                },
                specifics: {
                    default: {
                        encoder: structbuf.bridge.encoder(structbuf.csp.e2e.CallOffer, {
                            offer: encodeCallOffer(this._payload),
                        }),
                        messageProperties: {
                            type: CspE2eConversationType.CALL_OFFER,
                            // Flags per the `call-offer` structbuf docs: push notification + "short-
                            // lived server queuing" (a stale, undelivered call offer is meaningless).
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
        if (!this._precondition()) {
            return 'discarded';
        }
        return hasAuthority() ? 'sent' : 'follower-mode';
    }
}
