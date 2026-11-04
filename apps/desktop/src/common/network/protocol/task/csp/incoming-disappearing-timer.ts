import {u64ToHexLe} from '@threema/ts-utils/number/u64-to-hex-le';

import {ReceiverType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact, ContactInit} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
} from '~/common/network/protocol/task';
import {commonGroupReceiveSteps} from '~/common/network/protocol/task/common/group-helpers';
import {getConversationById} from '~/common/network/protocol/task/message-processing-helpers';
import type {DisappearingTimer} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import type {
    ContactConversationId,
    GroupConversationId,
    IdentityString,
    MessageId,
} from '~/common/network/types';

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
        private readonly _senderContactOrInit: ModelStore<Contact> | ContactInit,
        private readonly _timer: DisappearingTimer,
        private readonly _createdAt: Date,
    ) {
        const messageIdHex = u64ToHexLe(messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.incoming-disappearing-timer.${messageIdHex}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        // F1Whisper fork (P-H03): for a GROUP conversation, authorize the sender through the same
        // common group receive steps other group-control messages use (active group, current
        // membership, creator-policy fallback) before applying the timer. Without this, any sender
        // who merely knows a group's id + creator identity (visible on the wire, not secret) could
        // silently override the disappearing timer for a group they were never in, have been kicked
        // from, or that has since left -- `IncomingDisappearingTimerTask` previously skipped group
        // auth entirely (the outer dispatcher's `group-control` category, unlike the simpler
        // categories, expects each task to run its own common group receive steps, exactly as
        // `IncomingGroupNameTask`/`IncomingGroupLeaveTask`/etc. already do).
        if (this._conversationId.type === ReceiverType.GROUP) {
            const receiveStepsResult = await commonGroupReceiveSteps(
                this._conversationId.groupId,
                this._conversationId.creatorIdentity,
                this._senderContactOrInit,
                handle,
                this._services,
                this._log,
            );
            if (receiveStepsResult === undefined) {
                this._log.info(
                    'Discarding group disappearing-timer message: sender is not an authorized current member',
                );
                return;
            }
        }

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
