import type {Logger} from '~/common/logging';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import type {CallRingingPayload} from '~/common/network/protocol/call/o2o-call-signaling';
import type {IdentityString, MessageId} from '~/common/network/types';
import {u64ToHexLe} from '~/common/utils/number';

/**
 * Receive and process an incoming `call-ringing` (0x64): the callee is ringing for our outgoing
 * call.
 */
export class IncomingCallRingingTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        messageId: MessageId,
        private readonly _senderIdentity: IdentityString,
        private readonly _payload: CallRingingPayload,
    ) {
        const messageIdHex = u64ToHexLe(messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.incoming-call-ringing.${messageIdHex}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        this._log.debug(`Processing call-ringing (callId=${this._payload.callId})`);
        this._services.model.call.o2o.handleIncomingRinging(this._senderIdentity, this._payload.callId);
    }
}
