import type {Logger} from '~/common/logging';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import type {CallIceCandidatePayload} from '~/common/network/protocol/call/o2o-call-signaling';
import type {IdentityString, MessageId} from '~/common/network/types';
import {u64ToHexLe} from '~/common/utils/number';

/**
 * Receive and process incoming `call-ice-candidate`s (0x62) for the active call.
 */
export class IncomingCallIceCandidateTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        messageId: MessageId,
        private readonly _senderIdentity: IdentityString,
        private readonly _payload: CallIceCandidatePayload,
    ) {
        const messageIdHex = u64ToHexLe(messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.incoming-call-ice-candidate.${messageIdHex}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.debug(
            `Processing ${this._payload.candidates.length} call-ice-candidate(s) (callId=${this._payload.callId})`,
        );
        this._services.model.call.o2o.handleIncomingIceCandidates(this._senderIdentity, this._payload);
    }
}
