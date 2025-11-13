import type {PollAnnounceType, PollAnswerType, PollDisplayMode, PollState} from '~/common/enum';
import type {
    OutboundFileMessageInitFragment,
    OutboundImageMessageInitFragment,
    OutboundPollMessageInitFragment,
    OutboundTextMessageInitFragment,
    OutboundVideoMessageInitFragment,
    OutboundAudioMessageInitFragment,
} from '~/common/network/protocol/task/message-processing-helpers';
import type {IdentityString, MessageId, PollId} from '~/common/network/types';
import type {Dimensions, ReadonlyUint8Array, u53} from '~/common/types';

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
 * Partial data the {@link ConversationViewModelController} needs to prepare a message for sending.
 */
export type OutboundMessageInitFragment =
    | Omit<OutboundTextMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundFileMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundImageMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundVideoMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundAudioMessageInitFragment, 'direction' | 'id' | 'createdAt'>
    | Omit<OutboundPollMessageInitFragment, 'direction' | 'id' | 'createdAt'>;
