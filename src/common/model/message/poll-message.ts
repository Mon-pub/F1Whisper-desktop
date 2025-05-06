import type {
    DbConversationUid,
    DbCreateMessage,
    DbMessageCommon,
    DbMessageUid,
    DbPollMessage,
    DbPollMessageFragment,
    DbPollVoteFragment,
    UidOf,
} from '~/common/db';
import {MessageDirection, MessageType, PollState, PollMessageType} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Contact, ServicesForModel} from '~/common/model';
import {
    InboundBaseMessageModelController,
    OutboundBaseMessageModelController,
} from '~/common/model/message';
import {NO_SENDER} from '~/common/model/message/common';
import type {GuardedStoreHandle} from '~/common/model/types/common';
import type {ConversationControllerHandle} from '~/common/model/types/conversation';
import type {
    AnyPollMessageModelStore,
    BaseMessageView,
    CommonBaseMessageView,
    DirectedMessageFor,
    UnifiedEditMessage,
} from '~/common/model/types/message';
import type {
    CommonPollMessageView,
    IInboundPollMessageModelStore,
    InboundPollCloseFragment,
    InboundPollMessageBundle,
    InboundPollMessageController,
    InboundPollMessageModel,
    InboundPollMessageView,
    IOutboundPollMessageModelStore,
    OutboundPollCloseFragment,
    OutboundPollMessageBundle,
    OutboundPollMessageController,
    OutboundPollMessageModel,
    OutboundPollMessageView,
} from '~/common/model/types/message/poll';
import {ModelStore} from '~/common/model/utils/model-store';
import type {ActiveTaskCodecHandle, PassiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingPollUpdateTask} from '~/common/network/protocol/task/csp/outgoing-poll-update';
import type {IdentityString} from '~/common/network/types';
import {assert, unreachable} from '~/common/utils/assert';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

export function createPollMessage<TDirection extends MessageDirection>(
    services: ServicesForModel,
    common: Omit<DbMessageCommon<MessageType.POLL>, 'uid' | 'type' | 'ordinal'>,
    init: DirectedMessageFor<TDirection, MessageType.POLL, 'init'>,
): DbPollMessage {
    const {db} = services;

    const pollMessageType =
        init.pollState === PollState.CLOSED
            ? PollMessageType.POLL_CLOSED
            : PollMessageType.POLL_CREATED;

    // Create poll message
    const message: DbCreateMessage<DbPollMessage> = {
        ...common,
        ...init,
        type: MessageType.POLL,
        pollMessageType,
    };
    const uid = db.createPollMessage(message);

    // Cast is ok here because we know this `uid` is a poll message
    return db.getMessageByUid(uid) as DbPollMessage;
}

/**
 * Close a poll and return the new data.
 *
 * @throws if messageUid does not reference a poll message or if the message referenced by the
 * `messageUid` is not in the conversation referenced by the `conversationUid`.
 */
function closePollMessage(
    services: ServicesForModel,
    messageUid: DbMessageUid,
    conversationUid: DbConversationUid,
    pollMessageFragment: InboundPollCloseFragment | OutboundPollCloseFragment,
): DbPollMessage {
    const {db} = services;

    // We use a type transformation here to make clear that these are different types that match
    // coincidentally.
    const dbPollMessageFragment: DbPollMessageFragment = {
        ...pollMessageFragment,
    };
    db.closePoll(conversationUid, dbPollMessageFragment);
    const pollMessage = db.getMessageByUid(messageUid);
    assert(
        pollMessage?.type === MessageType.POLL && pollMessage.conversationUid === conversationUid,
        'The message must be of type poll and belong to the same conversation',
    );
    return pollMessage;
}

export function getPollMessageModelStore<TModelStore extends AnyPollMessageModelStore>(
    services: ServicesForModel,
    conversation: ConversationControllerHandle,
    message: DbPollMessage,
    common: BaseMessageView<TModelStore['ctx']>,
    sender: ModelStore<Contact> | typeof NO_SENDER,
): TModelStore {
    const data: Omit<CommonPollMessageView, keyof CommonBaseMessageView> = {
        ...message,
        pollMessageType: message.pollMessageType ?? PollMessageType.POLL_CREATED,
    };

    switch (common.direction) {
        case MessageDirection.INBOUND: {
            assert(
                sender !== NO_SENDER,
                `Expected sender of inbound ${message.type} message ${message.uid} to exist`,
            );
            return new InboundPollMessageModelStore(
                services,
                {...common, ...data},
                message.uid,
                conversation,
                sender,
            ) as TModelStore; // This is trivially true as common.direction === TModelStore['ctx']
        }
        case MessageDirection.OUTBOUND: {
            return new OutboundPollMessageModelStore(
                services,
                {...common, ...data},
                message.uid,
                conversation,
            ) as TModelStore; // This is trivially true as common.direction === TModelStore['ctx']
        }
        default:
            return unreachable(common);
    }
}

export class InboundPollMessageModelController
    extends InboundBaseMessageModelController<InboundPollMessageBundle['view']>
    implements InboundPollMessageController
{
    /** @inheritdoc */
    public readonly pollVote: InboundPollMessageController['pollVote'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        // eslint-disable-next-line @typescript-eslint/require-await
        fromLocal: async (
            pollVoteFragments: DbPollVoteFragment,
            senderIdentity: IdentityString,
        ) => {
            const {id, announceType} = this.lifetimeGuard.run((handle) => handle.view());

            const task = new OutgoingPollUpdateTask(
                this._services,
                this._conversation.getReceiver().get(),
                this.conversation(),
                id,
                pollVoteFragments,
                announceType,
            );

            this._services.taskManager.schedule(task).catch(() => {
                // Ignore
            });

            this.pollVote.direct(pollVoteFragments, senderIdentity);
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        fromRemote: async (
            taskHandle: ActiveTaskCodecHandle<'volatile'>,
            pollVoteFragments: DbPollVoteFragment,
            senderIdentity: IdentityString,
        ) => {
            this.pollVote.direct(pollVoteFragments, senderIdentity);
        },
        fromSync: (
            taskHandle: PassiveTaskCodecHandle,
            pollVoteFragments: DbPollVoteFragment,
            senderIdentity: IdentityString,
        ) => {
            this.pollVote.direct(pollVoteFragments, senderIdentity);
        },
        direct: (pollVoteFragments: DbPollVoteFragment, senderIdentity: IdentityString) => {
            this.lifetimeGuard.update((view) => {
                this._services.db.updatePollVotes(
                    this._conversation.uid,
                    pollVoteFragments,
                    senderIdentity,
                );

                const poll = this._services.db.getPollMessageFragment(
                    pollVoteFragments.creatorIdentity,
                    this._conversation.uid,
                    pollVoteFragments.pollId,
                );

                assert(
                    poll !== undefined,
                    'Poll is undefined during vote. This should never happen!',
                );

                return {choices: poll.choices};
            });
        },
    };

    /** @inheritdoc */
    public readonly close: InboundPollMessageController['close'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        // eslint-disable-next-line @typescript-eslint/require-await
        fromRemote: async (handle, fragment) => {
            this._log.debug('Closing poll from remote');
            this.close.direct(fragment);
        },

        fromSync: (handle, fragment) => {
            this._log.debug('Closing poll from sync');
            this.close.direct(fragment);
        },

        direct: (fragment) => {
            this.lifetimeGuard.update(() => {
                const updatedPoll = closePollMessage(
                    this._services,
                    this.uid,
                    this._conversation.uid,
                    fragment,
                );
                return {
                    choices: updatedPoll.choices,
                    participants: updatedPoll.participants,
                    pollState: PollState.CLOSED,
                };
            });
        },
    };

    protected override _editMessage(
        message: GuardedStoreHandle<InboundPollMessageView>,
        editedMessage: UnifiedEditMessage,
    ): void {
        throw new Error('Editing poll massages is not supported.');
    }
}

export class OutboundPollMessageModelController
    extends OutboundBaseMessageModelController<OutboundPollMessageBundle['view']>
    implements OutboundPollMessageController
{
    /** @inheritdoc */
    public readonly pollVote: OutboundPollMessageController['pollVote'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        // eslint-disable-next-line @typescript-eslint/require-await
        fromLocal: async (
            pollVoteFragments: DbPollVoteFragment,
            senderIdentity: IdentityString,
        ) => {
            const {id, announceType} = this.lifetimeGuard.run((handle) => handle.view());

            const task = new OutgoingPollUpdateTask(
                this._services,
                this._conversation.getReceiver().get(),
                this.conversation(),
                id,
                pollVoteFragments,
                announceType,
            );

            this._services.taskManager.schedule(task).catch(() => {
                // Ignore
            });

            this.pollVote.direct(pollVoteFragments, senderIdentity);
        },
        // eslint-disable-next-line @typescript-eslint/require-await
        fromRemote: async (
            taskHandle: ActiveTaskCodecHandle<'volatile'>,
            pollVoteFragments: DbPollVoteFragment,
            senderIdentity: IdentityString,
        ) => {
            this.pollVote.direct(pollVoteFragments, senderIdentity);
        },
        fromSync: (
            taskHandle: PassiveTaskCodecHandle,
            pollVoteFragments: DbPollVoteFragment,
            senderIdentity: IdentityString,
        ) => {
            this.pollVote.direct(pollVoteFragments, senderIdentity);
        },
        direct: (pollVoteFragments: DbPollVoteFragment, senderIdentity: IdentityString) => {
            this.lifetimeGuard.update((view) => {
                this._services.db.updatePollVotes(
                    this._conversation.uid,
                    pollVoteFragments,
                    senderIdentity,
                );

                const poll = this._services.db.getPollMessageFragment(
                    pollVoteFragments.creatorIdentity,
                    this._conversation.uid,
                    pollVoteFragments.pollId,
                );

                return poll !== undefined ? {choices: poll.choices} : {};
            });
        },
    };

    /** @inheritdoc */
    public readonly close: OutboundPollMessageController['close'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        fromSync: (handle, fragment) => {
            this._log.debug('Closing poll from sync');
            this.close.direct(fragment);
        },

        direct: (fragment) => {
            this.lifetimeGuard.update(() => {
                const updatedPoll = closePollMessage(
                    this._services,
                    this.uid,
                    this._conversation.uid,
                    fragment,
                );
                return {
                    choices: updatedPoll.choices,
                    participants: updatedPoll.participants,
                    pollState: PollState.CLOSED,
                };
            });
        },
    };

    protected override _editMessage(
        message: GuardedStoreHandle<OutboundPollMessageView>,
        editedMessage: UnifiedEditMessage,
    ): void {
        throw new Error('Editing poll massages is not supported.');
    }
}

export class InboundPollMessageModelStore
    extends ModelStore<InboundPollMessageModel>
    implements IInboundPollMessageModelStore
{
    public constructor(
        services: ServicesForModel,
        view: InboundPollMessageBundle['view'],
        uid: UidOf<DbPollMessage>,
        conversation: ConversationControllerHandle,
        sender: ModelStore<Contact>,
    ) {
        const {logging} = services;
        const tag = `message.inbound.poll.${uid}`;
        super(
            view,
            new InboundPollMessageModelController(
                services,
                uid,
                MessageType.POLL,
                conversation,
                sender,
            ),
            MessageDirection.INBOUND,
            MessageType.POLL,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}

export class OutboundPollMessageModelStore
    extends ModelStore<OutboundPollMessageModel>
    implements IOutboundPollMessageModelStore
{
    public constructor(
        services: ServicesForModel,
        view: OutboundPollMessageBundle['view'],
        uid: UidOf<DbPollMessage>,
        conversation: ConversationControllerHandle,
    ) {
        const {logging} = services;
        const tag = `message.outbound.poll.${uid}`;
        super(
            view,
            new OutboundPollMessageModelController(services, uid, MessageType.POLL, conversation),
            MessageDirection.OUTBOUND,
            MessageType.POLL,
            {
                debug: {
                    log: logging.logger(`model.${tag}`),
                    tag,
                },
            },
        );
    }
}
