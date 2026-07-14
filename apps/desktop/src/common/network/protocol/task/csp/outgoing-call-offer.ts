import {CspE2eConversationType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact} from '~/common/model';
import {encodeCallOffer, type CallOfferPayload} from '~/common/network/protocol/call/o2o-call-signaling';
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
export class OutgoingCallOfferTask implements ActiveTask<void, 'volatile'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _receiver: Contact,
        private readonly _payload: CallOfferPayload,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-call-offer.${this._payload.callId}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.debug(`Sending call-offer (callId=${this._payload.callId})`);

        const messageTask = new OutgoingCspMessagesTask(this._services, [
            {
                receiver: {main: this._receiver},
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
    }
}
