import type {DbPollVoteFragment} from '~/common/db';
import {
    CspE2eConversationType,
    CspE2eGroupConversationType,
    MessageType,
    PollAnnounceType,
    ReceiverType,
} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {AnyReceiver, Conversation} from '~/common/model';
import {getIdentityString} from '~/common/model/contact';
import type {ModelStore} from '~/common/model/utils/model-store';
import * as protobuf from '~/common/network/protobuf';
import {CspMessageFlags, D2mMessageFlags} from '~/common/network/protocol/flags';
import {
    type ActiveTask,
    type ActiveTaskSymbol,
    ACTIVE_TASK,
    type ServicesForTasks,
    type ActiveTaskCodecHandle,
} from '~/common/network/protocol/task';
import {OutgoingCspMessagesTask} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import {randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';
import type {MessageId} from '~/common/network/types';
import {unreachable} from '~/common/utils/assert';
import {UTF8} from '~/common/utils/codec';
import {dateToUnixTimestampMs, intoUnsignedLong, u64ToHexLe} from '~/common/utils/number';

export class OutgoingPollUpdateTask<TReceiver extends AnyReceiver>
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
        private readonly _pollVoteFragments: DbPollVoteFragment,
        private readonly _announceType: PollAnnounceType,
    ) {
        // Instantiate logger
        const messageIdHex = u64ToHexLe(this._messageId);
        this._log = _services.logging.logger(
            `network.protocol.task.outgoing-poll-update.${messageIdHex}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const {pollId, creatorIdentity, choices} = this._pollVoteFragments;
        const messageModelStore = this._conversation.get().controller.getMessage(this._messageId);
        if (messageModelStore === undefined) {
            this._log.error('Message does not exist anymore, aborting edit');
            return;
        }
        if (messageModelStore.type !== MessageType.POLL) {
            this._log.error('Message is not of type poll and cannot be updated');
            return;
        }

        // Encode message
        const encoder = structbuf.bridge.encoder(structbuf.csp.e2e.PollVote, {
            pollId,
            creatorIdentity: UTF8.encode(creatorIdentity),
            choices: UTF8.encode(
                JSON.stringify(choices.map((c) => [c.choiceId, c.selected ? 1 : 0])),
            ),
        });

        // Message properties that apply both to 1:1 and group edit messages
        const sharedMessageProperties = {
            messageId: randomMessageId(this._services.crypto),
            allowUserProfileDistribution: true,
            createdAt: new Date(),
        };

        const cspMessageFlags = CspMessageFlags.fromPartial({
            sendPushNotification: false,
        });

        let task;

        if (this._announceType === PollAnnounceType.ON_CLOSE) {
            // PollAnnounceType is ON_CLOSE, send votes only to poll creator

            if (this._services.device.identity.string === creatorIdentity) {
                // If voter is also poll creator then just reflect message
                const reflectMessage = {
                    envelope: {
                        outgoingMessage: protobuf.utils.creator(protobuf.d2d.OutgoingMessage, {
                            conversation: protobuf.utils.creator(protobuf.d2d.ConversationId, {
                                contact: creatorIdentity,
                                group: undefined,
                                distributionList: undefined,
                            }),
                            messageId: intoUnsignedLong(this._messageId),
                            threadMessageId: undefined, // TODO(DESK-296): Set thread message ID
                            createdAt: intoUnsignedLong(
                                dateToUnixTimestampMs(messageModelStore.get().view.createdAt),
                            ),
                            type: CspE2eConversationType.POLL_VOTE,
                            body: encoder.encode(new Uint8Array(encoder.byteLength())),
                            nonces: [],
                        }),
                    },
                    flags: D2mMessageFlags.none(),
                };
                await handle.reflect([reflectMessage]);
                return;
            }

            const creatorModel = this._services.model.contacts
                .getByIdentity(creatorIdentity)
                ?.get();
            if (creatorModel === undefined) {
                this._log.error('Contact for poll creatorIdentity not found. Abort');
                return;
            }

            task = new OutgoingCspMessagesTask(this._services, [
                {
                    receiver: creatorModel,
                    sharedMessageProperties,
                    specifics: {
                        default: {
                            encoder,
                            messageProperties: {
                                cspMessageFlags,
                                type: CspE2eConversationType.POLL_VOTE,
                            },
                        },
                    },
                },
            ]);
        } else {
            // PollAnnounceType is ON_EVERY_VOTE, send votes to group or single chat
            switch (this._receiverModel.type) {
                case ReceiverType.CONTACT: {
                    task = new OutgoingCspMessagesTask(this._services, [
                        {
                            receiver: this._receiverModel,
                            sharedMessageProperties,
                            specifics: {
                                default: {
                                    encoder,
                                    messageProperties: {
                                        cspMessageFlags,
                                        type: CspE2eConversationType.POLL_VOTE,
                                    },
                                },
                            },
                        },
                    ]);

                    break;
                }
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
                            receiver: this._receiverModel,
                            sharedMessageProperties,
                            specifics: {
                                default: {
                                    encoder: groupEncoder,
                                    messageProperties: {
                                        cspMessageFlags,
                                        type: CspE2eGroupConversationType.GROUP_POLL_VOTE,
                                    },
                                },
                            },
                        },
                    ]);

                    break;
                }
                case ReceiverType.DISTRIBUTION_LIST: {
                    // TODO(DESK-597): Distribution lists
                    this._log.warn('Distribution lists not implemented yet');
                    return;
                }
                default:
                    unreachable(this._receiverModel);
            }
        }

        await task.run(handle);
    }
}
