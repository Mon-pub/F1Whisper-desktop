import type {Logger} from '~/common/logging';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {getConversationById} from '~/common/network/protocol/task/message-processing-helpers';
import type {DisappearingTimer} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import type {
    ContactConversationId,
    GroupConversationId,
    IdentityString,
    MessageId,
} from '~/common/network/types';
import {u64ToHexLe} from '~/common/utils/number';

/**
 * F1Whisper fork: process an incoming disappearing-messages timer control message (1:1 or group).
 *
 * Persists the new per-conversation timer and appends a local disappearing-timer status row. This is
 * local-only enforcement: the message itself is the cross-member sync (Android never reflects it).
 */
export class IncomingDisappearingTimerTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    protected readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        messageId: MessageId,
        private readonly _conversationId: ContactConversationId | GroupConversationId,
        private readonly _senderIdentity: IdentityString,
        private readonly _timer: DisappearingTimer,
        private readonly _createdAt: Date,
    ) {
        const messageIdHex = u64ToHexLe(messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.incoming-disappearing-timer.${messageIdHex}`,
        );
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        const conversation = getConversationById(this._services, this._conversationId);
        if (conversation === undefined) {
            this._log.warn(`Conversation not found, ignoring disappearing-timer message`);
            return;
        }

        this._log.info(
            `Setting disappearing-messages timer to ${this._timer.timerSeconds}s (from ${this._senderIdentity})`,
        );
        // IMPORTANT: use the `fromRemote` path — it updates the local timer + status row but MUST
        // NOT send an outgoing control message, otherwise an incoming change would echo back to the
        // sender (the per-device echo-loop). This is the critical echo-loop guard.
        conversation
            .get()
            .controller.updateEphemeralTimer.fromRemote(
                this._timer.timerSeconds,
                this._senderIdentity,
                this._createdAt,
            );
    }
}
