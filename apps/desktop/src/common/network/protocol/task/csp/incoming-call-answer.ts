import type {Logger} from '~/common/logging';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import type {CallAnswerPayload} from '~/common/network/protocol/call/o2o-call-signaling';
import type {IdentityString, MessageId} from '~/common/network/types';
import {u64ToHexLe} from '~/common/utils/number';

/**
 * Receive and process an incoming `call-answer` (0x61): either an accept (with an SDP answer) or
 * a reject (with a reason) for our outgoing call.
 */
export class IncomingCallAnswerTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        messageId: MessageId,
        private readonly _senderIdentity: IdentityString,
        private readonly _payload: CallAnswerPayload,
    ) {
        const messageIdHex = u64ToHexLe(messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.incoming-call-answer.${messageIdHex}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.info(
            `Processing call-answer (callId=${this._payload.callId}, action=${this._payload.action})`,
        );
        await this._services.model.call.o2o.handleIncomingAnswer(
            this._senderIdentity,
            this._payload,
        );
    }
}
