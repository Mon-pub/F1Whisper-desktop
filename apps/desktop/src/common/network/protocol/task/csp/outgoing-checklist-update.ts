import {
    CspE2eConversationType,
    CspE2eGroupConversationType,
    MessageDirection,
    MessageType,
    PollState,
    ReceiverType,
} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {AnyReceiver, Conversation} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
import type {ModelStore} from '~/common/model/utils/model-store';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {getPollJsonData} from '~/common/network/protocol/task/csp/common';
import {OutgoingCspMessagesTask} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import {randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import type {MessageId, PollId} from '~/common/network/types';
import {unreachable} from '~/common/utils/assert';
import {UTF8} from '~/common/utils/codec';
import {u64ToHexLe} from '~/common/utils/number';

/**
 * Re-broadcast a checklist's current (open) state as a `PollSetup`/`GroupPollSetup` CSP message
 * (F1Whisper fork).
 *
 * This is sent after the creator edits a checklist's items. The recipient recognizes the same
 * (still-open) checklist poll id and merges the new choices in place instead of creating a new poll
 * bubble (see `BaseConversationMessageTask._mergeChecklist`). Unlike
 * {@link OutgoingConversationMessageTask}, this task does NOT add a local message and is driven from
 * the existing poll model store, reusing the same poll-setup encoding.
 */
export class OutgoingChecklistUpdateTask<TReceiver extends AnyReceiver>
    implements ActiveTask<void, 'persistent'>
{
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;

    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _receiverModel: TReceiver,
        private readonly _conversation: ModelStore<Conversation>,
        private readonly _messageId: MessageId,
        private readonly _pollId: PollId,
    ) {
        const messageIdHex = u64ToHexLe(this._messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-checklist-update.${messageIdHex}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const messageModelStore = this._conversation.get().controller.getMessage(this._messageId);
        if (messageModelStore === undefined) {
            this._log.error('Checklist message does not exist anymore, aborting edit broadcast');
            return;
        }
        if (messageModelStore.type !== MessageType.POLL) {
            this._log.error('Message is not of type poll and cannot be re-broadcast');
            return;
        }
        if (messageModelStore.ctx !== MessageDirection.OUTBOUND) {
            // Only the creator re-broadcasts their own checklist.
            this._log.error('Cannot re-broadcast an inbound checklist');
            return;
        }
        const messageModel = messageModelStore.get();
        if (messageModel.view.pollState === PollState.CLOSED) {
            this._log.warn('Refusing to re-broadcast a closed checklist');
            return;
        }

        // Encode the current (open) checklist state as a poll-setup. Since the poll is open, no
        // votes/participants are encoded (`getPollJsonData` omits them for open polls).
        const pollJson = getPollJsonData(messageModel.view, [], []);
        const encoder = structbuf.bridge.encoder(structbuf.csp.e2e.PollSetup, {
            id: this._pollId,
            poll: UTF8.encode(JSON.stringify(pollJson)),
        });

        const sharedMessageProperties = {
            messageId: randomMessageId(this._services.crypto),
            allowUserProfileDistribution: true,
            createdAt: new Date(),
        };

        // No push notification: a checklist edit is a silent in-place update.
        const cspMessageFlags = CspMessageFlags.fromPartial({
            sendPushNotification: false,
        });

        let task;
        switch (this._receiverModel.type) {
            case ReceiverType.CONTACT:
                task = new OutgoingCspMessagesTask(this._services, [
                    {
                        receiver: {main: this._receiverModel},
                        sharedMessageProperties,
                        specifics: {
                            default: {
                                encoder,
                                messageProperties: {
                                    cspMessageFlags,
                                    type: CspE2eConversationType.POLL_SETUP,
                                },
                            },
                        },
                    },
                ]);
                break;
            case ReceiverType.GROUP: {
                const groupEncoder = structbuf.bridge.encoder(
                    structbuf.csp.e2e.GroupMemberContainer,
                    {
                        groupId: this._receiverModel.view.groupId,
                        creatorIdentity: UTF8.encode(
                            getIdentityString(
                                this._services.device,
                                this._receiverModel.view.creator,
                            ),
                        ),
                        innerData: encoder,
                    },
                );

                task = new OutgoingCspMessagesTask(this._services, [
                    {
                        receiver: {main: this._receiverModel},
                        sharedMessageProperties,
                        specifics: {
                            default: {
                                encoder: groupEncoder,
                                messageProperties: {
                                    cspMessageFlags,
                                    type: CspE2eGroupConversationType.GROUP_POLL_SETUP,
                                },
                            },
                        },
                    },
                ]);
                break;
            }
            case ReceiverType.DISTRIBUTION_LIST:
                throw new Error('TODO(DESK-236): Implement distribution lists');
            default:
                unreachable(this._receiverModel);
        }

        await task.run(handle);
    }
}
