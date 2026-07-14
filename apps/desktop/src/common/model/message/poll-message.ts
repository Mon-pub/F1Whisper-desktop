import type {
    DbCreateMessage,
    DbMessageCommon,
    DbMessageUid,
    DbPollChoicesUpdate,
    DbPollCloseUpdate,
    DbPollLookup,
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
    ChecklistMergeFragment,
    CommonPollMessageView,
    IInboundPollMessageModelStore,
    InboundPollMessageBundle,
    InboundPollMessageController,
    InboundPollMessageModel,
    InboundPollMessageView,
    IOutboundPollMessageModelStore,
    OutboundPollMessageBundle,
    OutboundPollMessageController,
    OutboundPollMessageModel,
    OutboundPollMessageView,
} from '~/common/model/types/message/poll';
import {ModelStore} from '~/common/model/utils/model-store';
import type {ActiveTaskCodecHandle, PassiveTaskCodecHandle} from '~/common/network/protocol/task';
import {OutgoingChecklistUpdateTask} from '~/common/network/protocol/task/csp/outgoing-checklist-update';
import {OutgoingPollUpdateTask} from '~/common/network/protocol/task/csp/outgoing-poll-update';
import type {IdentityString} from '~/common/network/types';
import type {u53} from '~/common/types';
import {assert, unreachable, unwrap} from '~/common/utils/assert';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

/**
 * Create a poll message in the database.
 *
 * Important: If the `init.pollState === PollState.CLOSED`, all transformations of the votes must
 * have already happened.
 */
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
        ...pollInitToDbPollMessageFragment(init),
        type: MessageType.POLL,
        pollMessageType,
    };
    const uid = db.createPollMessage(message);

    // Cast is ok here because we know this `uid` is a poll message
    return db.getMessageByUid(uid) as DbPollMessage;
}

/**
 * Create a DbPollMessage fragment from a `poll-setup` message.
 */
function pollInitToDbPollMessageFragment(
    init: DirectedMessageFor<MessageDirection, MessageType.POLL, 'init'>,
): DbPollMessageFragment {
    return {
        announceType: init.announceType,
        answerType: init.answerType,
        choices: init.choices.map((choice) => ({
            choiceId: choice.choiceId,
            description: choice.description,
            // Since this is a poll-setup message, there will be no votes when it is open. When the
            // poll is being closed, the votes must have been updated before and are not used here.
            votes: [],
            sortKey: choice.sortKey,
        })),
        description: init.description,
        choicesType: init.choicesType,
        displayMode: init.displayMode,
        pollCreatorIdentity: init.pollCreatorIdentity,
        pollId: init.pollId,
        pollState: init.pollState,
    };
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
    pollLookup: DbPollLookup,
    pollUpdate: DbPollCloseUpdate,
): DbPollMessage {
    const {db} = services;
    db.closePoll(pollLookup, pollUpdate);
    const pollMessage = db.getMessageByUid(messageUid);
    assert(
        pollMessage?.type === MessageType.POLL &&
            pollMessage.conversationUid === pollLookup.conversationUid,
        'The message must be of type poll and belong to the same conversation',
    );
    return pollMessage;
}

/**
 * Apply a checklist edit (upsert/reorder/remove choices by `choiceId`, preserving votes) and return
 * the new poll data (F1Whisper fork).
 *
 * @throws if the poll referenced by the lookup does not exist.
 */
function mergeChecklistMessage(
    services: ServicesForModel,
    pollLookup: DbPollLookup,
    update: DbPollChoicesUpdate,
): Pick<CommonPollMessageView, 'choices' | 'description'> {
    const {db} = services;
    const updatedPoll = db.replacePollChoices(pollLookup, update);
    assert(
        updatedPoll !== undefined,
        'The poll referenced by a checklist edit must exist in the conversation',
    );
    return {choices: updatedPoll.choices, description: updatedPoll.description};
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
            this.lifetimeGuard.update(() => {
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
            this.lifetimeGuard.update((view) => {
                const updatedPoll = closePollMessage(
                    this._services,
                    this.uid,
                    {
                        conversationUid: this._conversation.uid,
                        pollCreatorIdentity: view.pollCreatorIdentity,
                        pollId: view.pollId,
                    },
                    {
                        choices: fragment.choices,
                        participants: fragment.participants,
                    },
                );
                return {
                    choices: updatedPoll.choices,
                    pollState: PollState.CLOSED,
                };
            });
        },
    };

    /** @inheritdoc */
    public readonly mergeChecklist: InboundPollMessageController['mergeChecklist'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        // eslint-disable-next-line @typescript-eslint/require-await
        fromRemote: async (handle, fragment) => {
            this._log.debug('Merging checklist edit from remote');
            this.mergeChecklist.direct(fragment);
        },

        fromSync: (handle, fragment) => {
            this._log.debug('Merging checklist edit from sync');
            this.mergeChecklist.direct(fragment);
        },

        direct: (fragment: ChecklistMergeFragment) => {
            this.lifetimeGuard.update((view) =>
                mergeChecklistMessage(
                    this._services,
                    {
                        conversationUid: this._conversation.uid,
                        pollCreatorIdentity: view.pollCreatorIdentity,
                        pollId: view.pollId,
                    },
                    {description: fragment.description, choices: fragment.choices},
                ),
            );
        },
    };

    /** @inheritdoc */
    public getParticipants(): readonly IdentityString[] {
        return this.lifetimeGuard.run((handle) => {
            const participants: IdentityString[] = [];
            const choices = handle.view().choices;
            assert(choices.length > 0, 'Poll must have have at least one choice');
            // All choices must have the same amount of votes in the same order. Therefore, we only
            // check the first choice for participants.
            for (const vote of unwrap(choices[0]).votes) {
                participants.push(vote.senderIdentity);
            }
            return participants;
        });
    }

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
            this.lifetimeGuard.update((view) => {
                const updatedPoll = closePollMessage(
                    this._services,
                    this.uid,
                    {
                        conversationUid: this._conversation.uid,
                        pollCreatorIdentity: this._services.device.identity.string,
                        pollId: view.pollId,
                    },
                    {
                        choices: fragment.choices,
                        participants: fragment.participants,
                    },
                );
                return {
                    choices: updatedPoll.choices,
                    pollState: PollState.CLOSED,
                };
            });
        },

        direct: () => {
            this.lifetimeGuard.update((view) => {
                const {participants, votes} = this.getParticipantsAndVotes();
                const fullChoices: DbPollCloseUpdate['choices'] = view.choices.map(
                    (choice, choiceIndex) => ({
                        choiceId: choice.choiceId,
                        description: choice.description,
                        // Unwrap is fine since `getParticipantVotes` guarantees the same length.
                        participantVotes: unwrap(votes[choiceIndex]),
                        sortKey: choice.sortKey,
                        totalAmountVotes: choice.totalAmountVotes,
                    }),
                );
                const updatedPoll = closePollMessage(
                    this._services,
                    this.uid,
                    {
                        conversationUid: this._conversation.uid,
                        pollCreatorIdentity: this._services.device.identity.string,
                        pollId: view.pollId,
                    },
                    {
                        choices: fullChoices,
                        participants,
                    },
                );
                return {
                    choices: updatedPoll.choices,
                    pollState: PollState.CLOSED,
                };
            });
        },
    };

    /** @inheritdoc */
    public readonly mergeChecklist: OutboundPollMessageController['mergeChecklist'] = {
        [TRANSFER_HANDLER]: PROXY_HANDLER,

        // eslint-disable-next-line @typescript-eslint/require-await
        fromLocal: async (fragment: ChecklistMergeFragment) => {
            // Apply the edit locally first so the UI updates immediately, then re-broadcast the new
            // (still-open) checklist state so recipients merge it in place (no new bubble).
            this.mergeChecklist.direct(fragment);

            const {id, pollId} = this.lifetimeGuard.run((handle) => handle.view());
            const task = new OutgoingChecklistUpdateTask(
                this._services,
                this._conversation.getReceiver().get(),
                this.conversation(),
                id,
                pollId,
            );
            this._services.taskManager.schedule(task).catch(() => {
                // Ignore: a failed re-broadcast leaves the local edit intact; the recipient can be
                // re-synced on the next edit.
            });
        },

        fromSync: (handle, fragment) => {
            this._log.debug('Merging checklist edit from sync');
            this.mergeChecklist.direct(fragment);
        },

        direct: (fragment: ChecklistMergeFragment) => {
            this.lifetimeGuard.update((view) =>
                mergeChecklistMessage(
                    this._services,
                    {
                        conversationUid: this._conversation.uid,
                        pollCreatorIdentity: this._services.device.identity.string,
                        pollId: view.pollId,
                    },
                    {description: fragment.description, choices: fragment.choices},
                ),
            );
        },
    };

    /** @inheritdoc */
    public getParticipantsAndVotes(): {
        readonly participants: readonly IdentityString[];
        readonly votes: readonly u53[][];
    } {
        return this.lifetimeGuard.run((handle) => {
            const choices = handle.view().choices;
            assert(choices.length > 0, 'Poll must have at least one choice');
            const participantSet: IdentityString[] = [];
            // All choices must have the same amount of votes in the same order. Therefore, we only
            // check the first choice for participants.
            for (const vote of unwrap(choices[0]).votes) {
                participantSet.push(vote.senderIdentity);
            }

            const participants = [...participantSet];
            const votes = handle.view().choices.map((choice) =>
                participants.map((_, index) => {
                    assert(
                        choice.votes[index] !== undefined,
                        'A choice has different amount of votes than expected',
                    );
                    return choice.votes[index].selected ? 1 : 0;
                }),
            );
            return {participants, votes};
        });
    }

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
