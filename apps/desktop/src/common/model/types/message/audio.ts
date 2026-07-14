import type {MessageDirection, MessageType} from '~/common/enum';
import type {Model} from '~/common/model';
import type {
    CommonBaseFileMessageInit,
    CommonBaseFileMessageView,
    CommonInboundMessageBundle,
    CommonOutboundMessageBundle,
    InboundBaseFileMessageController,
    InboundBaseFileMessageView,
    InboundBaseMessageInit,
    OutboundBaseFileMessageController,
    OutboundBaseFileMessageView,
    OutboundBaseMessageInit,
} from '~/common/model/types/message/common';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {f64} from '~/common/types';

// View

export interface CommonAudioMessageView extends CommonBaseFileMessageView {
    /**
     * Reported duration of the audio, in seconds.
     */
    readonly duration?: f64;
    /**
     * Whether this is a listen-once voice message (plays once, then burns). F1Whisper fork metadata.
     */
    readonly listenOnce?: boolean;
    /**
     * Whether the listen-once voice message has already been consumed (persistent burned flag).
     * F1Whisper fork metadata. (Enforcement of the burn is Phase 4e; this phase decodes + exposes.)
     */
    readonly listenOnceConsumed?: boolean;
}
export type InboundAudioMessageView = InboundBaseFileMessageView & CommonAudioMessageView;
export type OutboundAudioMessageView = OutboundBaseFileMessageView & CommonAudioMessageView;

// Init

/**
 * Fields needed to create a new audio message.
 */
export type CommonAudioMessageInit = CommonBaseFileMessageInit<MessageType.AUDIO> &
    Pick<CommonAudioMessageView, 'duration' | 'listenOnce' | 'listenOnceConsumed'>;
type InboundAudioMessageInit = CommonAudioMessageInit & InboundBaseMessageInit<MessageType.AUDIO>;
type OutboundAudioMessageInit = CommonAudioMessageInit & OutboundBaseMessageInit<MessageType.AUDIO>;

// Controller

/**
 * Controller for inbound audio messages.
 */
export type InboundAudioMessageController = Omit<
    InboundBaseFileMessageController<InboundAudioMessageView>,
    'thumbnailBlob'
> & {
    /**
     * F1Whisper fork (listen-once enforcement): mark this listen-once voice message as consumed
     * (BURN it) after playback completes. Sets the persistent `listenOnceConsumed` flag and deletes
     * the local audio blob so it can never be replayed. Idempotent and a no-op for non-listen-once
     * or already-consumed messages. Local-only — touches no wire metadata.
     */
    readonly markListenOnceConsumed: () => void;
};

/**
 * Controller for outbound audio messages.
 */
export type OutboundAudioMessageController = Omit<
    OutboundBaseFileMessageController<OutboundAudioMessageView>,
    'thumbnailBlob'
>;

// Model

/**
 * Inbound audio message model.
 */
type InboundAudioMessageModel = Model<
    InboundAudioMessageView,
    InboundAudioMessageController,
    MessageDirection.INBOUND,
    MessageType.AUDIO
>;
export type IInboundAudioMessageModelStore = ModelStore<InboundAudioMessageModel>;

/**
 * Outbound audio message model.
 */
type OutboundAudioMessageModel = Model<
    OutboundAudioMessageView,
    OutboundAudioMessageController,
    MessageDirection.OUTBOUND,
    MessageType.AUDIO
>;
export type IOutboundAudioMessageModelStore = ModelStore<OutboundAudioMessageModel>;

// Bundle

/**
 * Combined types related to an inbound audio message.
 */
export interface InboundAudioMessageBundle extends CommonInboundMessageBundle<'audio'> {
    readonly view: InboundAudioMessageView;
    readonly init: InboundAudioMessageInit;
    readonly controller: InboundAudioMessageController;
    readonly model: InboundAudioMessageModel;
    readonly store: ModelStore<InboundAudioMessageModel>;
}

/**
 * Combined types related to an outbound audio message.
 */
export interface OutboundAudioMessageBundle extends CommonOutboundMessageBundle<'audio'> {
    readonly view: OutboundAudioMessageView;
    readonly init: OutboundAudioMessageInit;
    readonly controller: OutboundAudioMessageController;
    readonly model: OutboundAudioMessageModel;
    readonly store: ModelStore<OutboundAudioMessageModel>;
}
