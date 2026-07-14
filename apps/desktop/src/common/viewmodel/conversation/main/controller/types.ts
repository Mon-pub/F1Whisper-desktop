import type {
    MessageType,
    PollAnnounceType,
    PollAnswerType,
    PollDisplayMode,
    PollState,
} from '~/common/enum';
import type {
    OutboundFileMessageInitFragment,
    OutboundImageMessageInitFragment,
    OutboundPollMessageInitFragment,
    OutboundTextMessageInitFragment,
    OutboundVideoMessageInitFragment,
    OutboundAudioMessageInitFragment,
} from '~/common/network/protocol/task/message-processing-helpers';
import type {IdentityString, MessageId, PollId} from '~/common/network/types';
import type {Dimensions, f64, ReadonlyUint8Array, u53} from '~/common/types';
import type {transcodeAudioToMp4Aac, transcodeAudioToMp4Opus} from '~/common/utils/audio';
import type {transcodeVideoToMp4H264} from '~/common/utils/video';

/**
 * Required data the {@link ConversationViewModelController} needs to send a message.
 */
export type SendMessageEventDetail =
    | SendTextBasedMessageInformation
    | SendFileBasedMessageInformation
    | SendPollBasedMessageInformation;

export interface SendTextBasedMessageInformation {
    readonly type: 'text';
    readonly text: string;
    readonly quotedMessageId?: MessageId | undefined;
}

export interface SendFileBasedMessageInformation {
    readonly type: 'files';
    readonly files: {
        readonly bytes: ReadonlyUint8Array;
        readonly thumbnailBytes?: ReadonlyUint8Array;
        readonly caption?: string;
        readonly fileName: string;
        readonly fileSize: u53;
        readonly mediaType: string;
        readonly thumbnailMediaType?: string;
        readonly dimensions?: Dimensions;
        readonly sendAsFile: boolean;
        readonly duration?: u53;
        /**
         * F1Whisper fork: when true, send this voice message as listen-once (emits `lo` on the wire).
         * Only meaningful for audio messages.
         */
        readonly listenOnce?: boolean;
        /**
         * Optional link-preview metadata (F1Whisper fork, MODEL-A). When set, the file is sent as an
         * image message (the preview image) carrying these on the wire as `lp_u`/`lp_t`/`lp_d`, with
         * the user's text as the caption. Produced by the sender-side link-preview fetcher; the
         * recipient never contacts the URL. See `LinkPreviewBackend`.
         */
        readonly linkPreview?: {
            readonly url: string;
            readonly title?: string;
            readonly description?: string;
        };
    }[];
}

export interface SendPollBasedMessageInformation {
    readonly type: 'poll';
    readonly description: string;
    readonly answerType: PollAnswerType;
    readonly announceType: PollAnnounceType;
    readonly displayMode: PollDisplayMode;
    readonly choices: {
        readonly choiceId: u53;
        readonly description: string;
    }[];
    readonly pollState: PollState;
}

export interface TextMessageWithByteLength {
    readonly type: 'text';
    readonly text: string;
    readonly byteLength: u53;
}

export interface PollLookup {
    readonly pollCreatorIdentity: IdentityString;
    readonly pollId: PollId;
}

/**
 * F1Whisper fork: the new ordered item set when the creator edits an open checklist.
 *
 * Surviving items MUST keep their existing `choiceId` so their votes are preserved across the
 * merge; new items get a fresh `choiceId`. The array order becomes the new display/sort order.
 */
export interface EditChecklistInformation {
    readonly pollCreatorIdentity: IdentityString;
    readonly pollId: PollId;
    readonly description?: string;
    readonly choices: readonly {
        readonly choiceId: u53;
        readonly description: string;
    }[];
}

/**
 * Partial data the {@link ConversationViewModelController} needs to prepare a message for sending.
 */
export type OutboundMessageInitFragment =
    | Omit<OutboundTextMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundFileMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundImageMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundVideoMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundAudioMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundPollMessageInitFragment, 'direction' | 'id' | 'createdAt'>;

export type TranscodeFunction =
    | typeof transcodeVideoToMp4H264
    | typeof transcodeAudioToMp4Aac
    | typeof transcodeAudioToMp4Opus;

export interface TranscodingResult {
    readonly type: MessageType.AUDIO | MessageType.FILE | MessageType.VIDEO;
    readonly bytes: ReadonlyUint8Array;
    readonly duration: f64;
    readonly mediaType: string;
    readonly fileName: string;
    readonly fileSize: u53;
}
