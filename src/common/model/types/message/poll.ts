import type {DbConversationUid, DbPollVoteFragment} from '~/common/db';
import type {
    MessageDirection,
    MessageType,
    PollAnnounceType,
    PollAnswerType,
    PollChoicesType,
    PollDisplayMode,
    PollState,
    PollMessageType,
} from '~/common/enum';
import type {Model} from '~/common/model';
import type {ControllerCustomUpdate, ControllerUpdate} from '~/common/model/types/common';
import type {
    CommonBaseMessageController,
    CommonBaseMessageInit,
    CommonBaseMessageView,
    CommonInboundMessageBundle,
    CommonOutboundMessageBundle,
    InboundBaseMessageController,
    InboundBaseMessageInit,
    InboundBaseMessageView,
    OutboundBaseMessageController,
    OutboundBaseMessageInit,
    OutboundBaseMessageView,
} from '~/common/model/types/message/common';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {IdentityString, PollId} from '~/common/network/types';
import type {i53, u53} from '~/common/types';

// View
export interface CommonPollMessageView extends CommonBaseMessageView {
    readonly pollId: PollId;
    readonly pollCreatorIdentity: IdentityString;
    readonly description: string;
    readonly pollState: PollState;
    readonly answerType: PollAnswerType;
    readonly announceType: PollAnnounceType;
    readonly displayMode: PollDisplayMode;
    readonly choicesType: PollChoicesType;
    readonly pollMessageType: PollMessageType;
    readonly choices: PollChoice[];
}

interface PollChoice {
    readonly choiceId: i53;
    readonly description: string;
    readonly sortKey: u53;
    readonly totalAmountVotes?: u53;
    readonly votes: readonly {
        readonly senderIdentity: IdentityString;
        readonly selected: boolean;
    }[];
}
export type InboundPollMessageView = InboundBaseMessageView & CommonPollMessageView;
export type OutboundPollMessageView = OutboundBaseMessageView & CommonPollMessageView;

// Init
type CommonPollMessageInit = CommonBaseMessageInit<MessageType.POLL> &
    Pick<
        CommonPollMessageView,
        | 'pollId'
        | 'pollCreatorIdentity'
        | 'description'
        | 'pollState'
        | 'answerType'
        | 'announceType'
        | 'displayMode'
        | 'choicesType'
    > & {
        readonly participants: readonly IdentityString[];
        readonly choices: (Omit<PollChoice, 'votes'> & {
            readonly participantVotes: readonly u53[];
        })[];
    };
type InboundPollMessageInit = CommonPollMessageInit & InboundBaseMessageInit<MessageType.POLL>;
type OutboundPollMessageInit = CommonPollMessageInit & OutboundBaseMessageInit<MessageType.POLL>;

// These aliases let us distinguish opening and closing polls from the type system perspective.
export type InboundPollCloseFragment = Pick<InboundPollMessageInit, 'choices' | 'participants'>;
export type OutboundPollCloseFragment = Pick<OutboundPollMessageInit, 'choices' | 'participants'>;

// Controller
type CommonPollMessageController<TView extends CommonPollMessageView> =
    CommonBaseMessageController<TView> & {
        readonly pollVote: ControllerUpdate<
            [pollVoteFragments: DbPollVoteFragment, senderIdentity: IdentityString]
        >;
    };

/**
 * Controller for inbound poll messages.
 */
export type InboundPollMessageController = InboundBaseMessageController<InboundPollMessageView> &
    CommonPollMessageController<InboundPollMessageView> & {
        readonly close: Omit<ControllerUpdate<[fragment: InboundPollCloseFragment]>, 'fromLocal'>;

        /**
         * Get the identity of everybody who casted a vote in this poll.
         */
        readonly getParticipants: () => readonly IdentityString[];
    };

/**
 * Controller for outbound poll messages.
 */
export type OutboundPollMessageController = OutboundBaseMessageController<OutboundPollMessageView> &
    CommonPollMessageController<OutboundPollMessageView> & {
        readonly close: Omit<
            ControllerCustomUpdate<[], [fragment: OutboundPollCloseFragment]>,
            'fromLocal' | 'fromRemote'
        >;

        /**
         * Get the identity of everybody who casted a vote in this poll and their votes.
         *
         * Each entry in the `votes` array represents on choice. The inner index points to the participant
         * array and the inner element says whether or not the participant has voted for this
         * choice.
         *
         * This function guarantees that the inner array of `votes` matches the order of the choices, i.e.
         * `votes[0]` corresponds to `choices[0]`, and that the length of the returned array matches the
         * number of choices.
         */
        readonly getParticipantsAndVotes: () => {
            readonly participants: readonly IdentityString[];
            readonly votes: readonly u53[][];
        };
    };

// Model

/**
 * Inbound poll message model.
 */
export type InboundPollMessageModel = Model<
    InboundPollMessageView,
    InboundPollMessageController,
    MessageDirection.INBOUND,
    MessageType.POLL
>;
export type IInboundPollMessageModelStore = ModelStore<InboundPollMessageModel>;

/**
 * Outbound poll message model.
 */
export type OutboundPollMessageModel = Model<
    OutboundPollMessageView,
    OutboundPollMessageController,
    MessageDirection.OUTBOUND,
    MessageType.POLL
>;
export type IOutboundPollMessageModelStore = ModelStore<OutboundPollMessageModel>;

// Bundle

/**
 * Combined types related to an inbound poll message.
 */
export interface InboundPollMessageBundle extends CommonInboundMessageBundle<'poll'> {
    readonly view: InboundPollMessageView;
    readonly init: InboundPollMessageInit;
    readonly controller: InboundPollMessageController;
    readonly model: InboundPollMessageModel;
}

/**
 * Combined types related to an outbound poll message.
 */
export interface OutboundPollMessageBundle extends CommonOutboundMessageBundle<'poll'> {
    readonly view: OutboundPollMessageView;
    readonly init: OutboundPollMessageInit;
    readonly controller: OutboundPollMessageController;
    readonly model: OutboundPollMessageModel;
}
