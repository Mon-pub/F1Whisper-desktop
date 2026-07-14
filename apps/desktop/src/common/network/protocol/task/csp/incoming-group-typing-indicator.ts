import type {Logger} from '~/common/logging';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {getConversationById} from '~/common/network/protocol/task/message-processing-helpers';
import type {GroupConversationId, IdentityString} from '~/common/network/types';

/**
 * F1Whisper fork: process an incoming group-typing indicator (CSP 0x84).
 *
 * Sets/clears the sender member's typing state on the group conversation (with a 15s per-member
 * auto-expiry). Local-only / ephemeral — never sends anything back (echo-loop guard).
 */
export class IncomingGroupTypingIndicatorTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    protected readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _conversationId: GroupConversationId,
        private readonly _senderIdentity: IdentityString,
        private readonly _isTyping: boolean,
    ) {
        this._log = _services.logging.logger(`network.protocol.task.incoming-group-typing`);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        const conversation = getConversationById(this._services, this._conversationId);
        if (conversation === undefined) {
            this._log.warn(`Group conversation not found, ignoring group-typing indicator`);
            return;
        }
        conversation.get().controller.updateGroupMemberTyping(this._senderIdentity, this._isTyping);
    }
}
