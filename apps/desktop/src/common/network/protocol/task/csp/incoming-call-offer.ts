import type {Logger} from '~/common/logging';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import type {CallOfferPayload} from '~/common/network/protocol/call/o2o-call-signaling';
import type {IdentityString, MessageId} from '~/common/network/types';
import {u64ToHexLe} from '~/common/utils/number';

/**
 * Receive and process an incoming `call-offer` (0x60), initiating a 1:1 call. Mirrors
 * `IncomingTypingIndicatorTask`'s shape; all the actual state-machine logic (glare guard, ringing,
 * WebRTC setup) lives in `O2oCallManager.handleIncomingOffer`.
 */
export class IncomingCallOfferTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        messageId: MessageId,
        private readonly _senderIdentity: IdentityString,
        private readonly _payload: CallOfferPayload,
    ) {
        const messageIdHex = u64ToHexLe(messageId);
        this._log = _services.logging.logger(`network.protocol.task.incoming-call-offer.${messageIdHex}`);
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.info(`Processing call-offer (callId=${this._payload.callId})`);
        await this._services.model.call.o2o.handleIncomingOffer(this._senderIdentity, this._payload);
    }
}
