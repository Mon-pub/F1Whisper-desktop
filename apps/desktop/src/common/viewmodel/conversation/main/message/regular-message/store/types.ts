import type {
    PollAnnounceType,
    PollAnswerType,
    PollDisplayMode,
    PollState,
    PollMessageType,
} from '~/common/enum';
import type {IdentityString, MessageId, PollId} from '~/common/network/types';
import type {Dimensions, f64, i53, u53} from '~/common/types';
import type {SingleUnicodeEmoji, UnsupportedEmoji} from '~/common/utils/emoji';
import type {
    AnyConversationMessageViewModelBundle,
    MessageSenderData,
    MessageStatusData,
} from '~/common/viewmodel/conversation/main/message/helpers';
import type {ConversationStatusMessageViewModelBundle} from '~/common/viewmodel/conversation/main/message/status-message';
import type {AnyMention} from '~/common/viewmodel/utils/mentions';
import type {SelfReceiverData} from '~/common/viewmodel/utils/receiver';
import type {AnySenderData} from '~/common/viewmodel/utils/sender';

/**
 * Data to be supplied to the UI layer as part of the `ViewModelStore`. This should be as close as
 * possible to the `MessageProps` that the message component expects, excluding props that only
 * exist in the ui layer.
 */
export interface ConversationRegularMessageViewModel {
    readonly type: 'regular-message';
    readonly direction: 'inbound' | 'outbound';
    readonly file?: {
        readonly duration?: f64;
        readonly imageRenderingType?: 'regular' | 'sticker';
        /** Whether this image/video is a spoiler (rendered blurred until tapped). F1Whisper fork. */
        readonly spoiler?: boolean;
        /** Whether this image/video was forwarded (renders a "Forwarded" header). F1Whisper fork. */
        readonly forwarded?: boolean;
        /** Link-preview card data, when this image is a link-preview. F1Whisper fork. */
        readonly linkPreview?: {
            readonly url: string;
            readonly title?: string;
            readonly description?: string;
        };
        /** Whether this audio is a listen-once voice message. F1Whisper fork. */
        readonly listenOnce?: boolean;
        /** Whether the listen-once voice message has already been consumed. F1Whisper fork. */
        readonly listenOnceConsumed?: boolean;
        readonly mediaType: string;
        readonly name: {
            /**
             * Default file name used as a fallback if the raw name is empty or `undefined`.
             */
            readonly default: string;
            /**
             * The raw (original) file name.
             */
            readonly raw?: string;
        };
        readonly sizeInBytes: u53;
        readonly sync: {
            readonly state: 'unsynced' | 'syncing' | 'synced' | 'failed';
            readonly direction: 'upload' | 'download' | undefined;
            /** Set when state is 'failed' due to scanner rejection; undefined otherwise. */
            readonly failureReason?: string;
        };
        readonly thumbnail?: {
            /**
             * Expected dimensions of the thumbnail image in its full size, used to render a
             * placeholder.
             */
            readonly expectedDimensions: Dimensions | undefined;
            readonly mediaType: string;
        };
        readonly type: 'audio' | 'file' | 'image' | 'video';
    };
    readonly id: MessageId;
    readonly emojiReactions: EmojiReactionData[];
    /**
     * Ordinal for message ordering in the conversation list.
     */
    readonly ordinal: u53;
    readonly quote?:
        | Exclude<AnyConversationMessageViewModelBundle, ConversationStatusMessageViewModelBundle>
        | 'not-found'
        | undefined;

    readonly sender: MessageSenderData;
    readonly status: MessageStatusData;
    readonly text?: {
        readonly mentions: readonly AnyMention[];
        /** Raw, unparsed, text. */
        readonly raw: string;
    };
    readonly history: {
        readonly editedAt: Date;
        readonly text: string;
    }[];

    readonly pollData?: PollData;

    /**
     * F1Whisper fork: present when this message disappears. Used to render the footer clock badge.
     */
    readonly disappearing?: {
        /** Disappearing timer in seconds frozen onto the message. */
        readonly timerSeconds: u53;
        /** When the message is due to disappear, or undefined if not yet stamped (e.g. unread). */
        readonly expiresAt?: Date;
    };
    /** F1Whisper fork: whether this message is pinned (for the pin indicator). */
    readonly pinned: boolean;
}

export interface PollData {
    readonly pollId: PollId;
    readonly pollCreatorIdentity: IdentityString;
    readonly description: string;
    readonly pollState: PollState;
    readonly answerType: PollAnswerType;
    readonly announceType: PollAnnounceType;
    readonly displayMode: PollDisplayMode;
    readonly pollMessageType: PollMessageType;
    readonly numberOfParticipants: u53;
    readonly choices: {
        readonly choiceId: i53;
        readonly description: string;
        readonly totalAmountVotes?: u53;
        readonly votes: readonly {
            readonly senderIdentity: IdentityString;
            readonly selected: boolean;
        }[];
    }[];
    readonly selfReceiverData: SelfReceiverData;
}

export interface PollVoteData {
    readonly pollId: PollId;
    readonly creatorIdentity: IdentityString;
    readonly choices: {
        readonly choiceId: i53;
        readonly selected: boolean;
    }[];
}

/**
 * Data related to an emoji reaction.
 */
type EmojiReactionData = SupportedEmojiReactionData | UnsupportedEmojiReactionData;

interface CommonEmojiReactionData {
    readonly at: Date;
    readonly direction: 'inbound' | 'outbound';
    readonly sender: AnySenderData;
}

interface SupportedEmojiReactionData extends CommonEmojiReactionData {
    readonly type: 'supported';
    readonly emoji: SingleUnicodeEmoji;
}

interface UnsupportedEmojiReactionData extends CommonEmojiReactionData {
    readonly type: 'unsupported';
    readonly emoji: UnsupportedEmoji;
}
