import type {MessageDirection, MessageType} from '~/common/enum';
import type {
    IInboundAudioMessageModelStore,
    InboundAudioMessageBundle,
    IOutboundAudioMessageModelStore,
    OutboundAudioMessageBundle,
} from '~/common/model/types/message/audio';
import type {
    CommonBaseMessageView,
    CommonInboundMessageBundle,
    CommonOutboundMessageBundle,
} from '~/common/model/types/message/common';
import type {
    InboundDeletedMessageBundle,
    InboundDeletedMessageModelStore,
    OutboundDeletedMessageModelStore,
    OutboundDeletedMessageBundle,
    InboundDeletedMessageModel,
    OutboundDeletedMessageModel,
} from '~/common/model/types/message/deleted';
import type {
    IInboundFileMessageModelStore,
    InboundFileMessageBundle,
    IOutboundFileMessageModelStore,
    OutboundFileMessageBundle,
} from '~/common/model/types/message/file';
import type {
    IInboundImageMessageModelStore,
    InboundImageMessageBundle,
    IOutboundImageMessageModelStore,
    OutboundImageMessageBundle,
} from '~/common/model/types/message/image';
import type {
    PartialPollMessageViewSnapshot,
    IInboundPollMessageModelStore,
    InboundPollMessageBundle,
    IOutboundPollMessageModelStore,
    OutboundPollMessageBundle,
} from '~/common/model/types/message/poll';
import type {
    IInboundTextMessageModelStore,
    InboundTextMessageBundle,
    IOutboundTextMessageModelStore,
    OutboundTextMessageBundle,
} from '~/common/model/types/message/text';
import type {
    IInboundVideoMessageModelStore,
    InboundVideoMessageBundle,
    IOutboundVideoMessageModelStore,
    OutboundVideoMessageBundle,
} from '~/common/model/types/message/video';
import type {AnyStatusMessageModelStore} from '~/common/model/types/status';
import type {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import type {ModelStore} from '~/common/model/utils/model-store';
import type {u53} from '~/common/types';
import type {ProxyMarked} from '~/common/utils/endpoint';
import type {IDerivableSetStore, LocalSetStore} from '~/common/utils/store/set-store';

export type * from './common';

/**
 * Helper to return the appropriate bundle for the specified inbound message type.
 */
export type InboundMessageFor<TType extends MessageType> = TType extends MessageType.TEXT
    ? InboundTextMessageBundle
    : TType extends MessageType.FILE
      ? InboundFileMessageBundle
      : TType extends MessageType.IMAGE
        ? InboundImageMessageBundle
        : TType extends MessageType.VIDEO
          ? InboundVideoMessageBundle
          : TType extends MessageType.AUDIO
            ? InboundAudioMessageBundle
            : TType extends MessageType.DELETED
              ? InboundDeletedMessageBundle
              : TType extends MessageType.POLL
                ? InboundPollMessageBundle
                : never;

/**
 * Helper to return the appropriate bundle for the specified outbound message type.
 */
export type OutboundMessageFor<TType extends MessageType> = TType extends MessageType.TEXT
    ? OutboundTextMessageBundle
    : TType extends MessageType.FILE
      ? OutboundFileMessageBundle
      : TType extends MessageType.IMAGE
        ? OutboundImageMessageBundle
        : TType extends MessageType.VIDEO
          ? OutboundVideoMessageBundle
          : TType extends MessageType.AUDIO
            ? OutboundAudioMessageBundle
            : TType extends MessageType.DELETED
              ? OutboundDeletedMessageBundle
              : TType extends MessageType.POLL
                ? OutboundPollMessageBundle
                : never;

type BundleProperty =
    | keyof CommonInboundMessageBundle<MessageType>
    | keyof CommonOutboundMessageBundle<MessageType>;

/**
 * Helper to return the appropriate bundle property for the specified direction and message type.
 */
export type DirectedMessageFor<
    TDirection extends MessageDirection,
    TType extends MessageType,
    TBundleProperty extends BundleProperty,
> = TDirection extends MessageDirection.INBOUND
    ? {
          readonly direction: MessageDirection.INBOUND;
      } & InboundMessageFor<TType>[TBundleProperty]
    : TDirection extends MessageDirection.OUTBOUND
      ? {
            readonly direction: MessageDirection.OUTBOUND;
        } & OutboundMessageFor<TType>[TBundleProperty]
      : never;

export type MessageFor<
    TDirection extends MessageDirection,
    TType extends MessageType,
    TVariant extends BundleProperty,
> = TDirection extends MessageDirection.INBOUND
    ? InboundMessageFor<TType>[TVariant]
    : TDirection extends MessageDirection.OUTBOUND
      ? OutboundMessageFor<TType>[TVariant]
      : never;

export type AnyMessage<TVariant extends BundleProperty> = MessageFor<
    MessageDirection,
    MessageType,
    TVariant
>;

/**
 * A unified type that can be used to update a message model without knowing its exact type.
 */
export type UnifiedEditMessage = Required<Pick<CommonBaseMessageView, 'lastEditedAt'>> & {
    readonly newText: string;
};

export type AnyMessageModel = AnyInboundMessageModel | AnyOutboundMessageModel;
export type AnyNonDeletedMessageModel = Exclude<
    AnyMessageModel,
    OutboundDeletedMessageBundle['model'] | InboundDeletedMessageBundle['model']
>;
export type AnyNonDeletedMessageModelStore = Exclude<
    AnyMessageModelStore,
    OutboundDeletedMessageModelStore | InboundDeletedMessageModelStore
>;
export type AnyDeletedMessageModel = InboundDeletedMessageModel | OutboundDeletedMessageModel;
export type AnyDeletedMessageModelStore =
    | InboundDeletedMessageModelStore
    | OutboundDeletedMessageModelStore;

export type AnyFileBasedMessageModel =
    | InboundAudioMessageBundle['model']
    | InboundFileMessageBundle['model']
    | InboundImageMessageBundle['model']
    | InboundVideoMessageBundle['model']
    | OutboundAudioMessageBundle['model']
    | OutboundFileMessageBundle['model']
    | OutboundImageMessageBundle['model']
    | OutboundVideoMessageBundle['model'];
export type AnyInboundMessageModel =
    | InboundTextMessageBundle['model']
    | InboundFileMessageBundle['model']
    | InboundImageMessageBundle['model']
    | InboundVideoMessageBundle['model']
    | InboundAudioMessageBundle['model']
    | InboundDeletedMessageBundle['model']
    | InboundPollMessageBundle['model'];
export type AnyOutboundMessageModel =
    | OutboundTextMessageBundle['model']
    | OutboundFileMessageBundle['model']
    | OutboundImageMessageBundle['model']
    | OutboundVideoMessageBundle['model']
    | OutboundAudioMessageBundle['model']
    | OutboundDeletedMessageBundle['model']
    | OutboundPollMessageBundle['model'];
export type AnyMessageModelStore =
    | AnyInboundNonDeletedMessageModelStore
    | AnyOutboundNonDeletedMessageModelStore
    | InboundDeletedMessageModelStore
    | OutboundDeletedMessageModelStore;
export type AnyInboundNonDeletedMessageModelStore =
    | IInboundTextMessageModelStore
    | IInboundFileMessageModelStore
    | IInboundImageMessageModelStore
    | IInboundVideoMessageModelStore
    | IInboundAudioMessageModelStore
    | IInboundPollMessageModelStore;
export type AnyOutboundNonDeletedMessageModelStore =
    | IOutboundTextMessageModelStore
    | IOutboundFileMessageModelStore
    | IOutboundImageMessageModelStore
    | IOutboundVideoMessageModelStore
    | IOutboundAudioMessageModelStore
    | IOutboundPollMessageModelStore;
export type AnyTextMessageModelStore =
    | IInboundTextMessageModelStore
    | IOutboundTextMessageModelStore;
export type AnyFileMessageModelStore =
    | IInboundFileMessageModelStore
    | IOutboundFileMessageModelStore;
export type AnyImageMessageModelStore =
    | IInboundImageMessageModelStore
    | IOutboundImageMessageModelStore;
export type AnyVideoMessageModelStore =
    | IInboundVideoMessageModelStore
    | IOutboundVideoMessageModelStore;
export type AnyAudioMessageModelStore =
    | IInboundAudioMessageModelStore
    | IOutboundAudioMessageModelStore;
export type AnyPollMessageModelStore =
    | IInboundPollMessageModelStore
    | IOutboundPollMessageModelStore;

export type AnyFileBasedMessageModelStore =
    | IInboundFileMessageModelStore
    | IOutboundFileMessageModelStore
    | IInboundImageMessageModelStore
    | IOutboundImageMessageModelStore
    | IInboundVideoMessageModelStore
    | IOutboundVideoMessageModelStore
    | IInboundAudioMessageModelStore
    | IOutboundAudioMessageModelStore;

export type SetOfAnyLocalMessageModelStore = IDerivableSetStore<
    | ModelStore<InboundTextMessageBundle['model']>
    | ModelStore<OutboundTextMessageBundle['model']>
    | ModelStore<InboundFileMessageBundle['model']>
    | ModelStore<OutboundFileMessageBundle['model']>
    | ModelStore<InboundImageMessageBundle['model']>
    | ModelStore<OutboundImageMessageBundle['model']>
    | ModelStore<InboundVideoMessageBundle['model']>
    | ModelStore<OutboundVideoMessageBundle['model']>
    | ModelStore<InboundAudioMessageBundle['model']>
    | ModelStore<OutboundAudioMessageBundle['model']>
    | ModelStore<InboundDeletedMessageBundle['model']>
    | ModelStore<OutboundDeletedMessageBundle['model']>
    | ModelStore<InboundPollMessageBundle['model']>
    | ModelStore<OutboundPollMessageBundle['model']>
>;
export type SetOfAnyLocalMessageOrStatusMessageModelStore = IDerivableSetStore<
    AnyMessageModelStore | AnyStatusMessageModelStore
>;

export type AnyFileBasedInboundMessageModelLifetimeGuard =
    | ModelLifetimeGuard<InboundFileMessageBundle['view']>
    | ModelLifetimeGuard<InboundImageMessageBundle['view']>
    | ModelLifetimeGuard<InboundVideoMessageBundle['view']>
    | ModelLifetimeGuard<InboundAudioMessageBundle['view']>;
export type AnyFileBasedOutboundMessageModelLifetimeGuard =
    | ModelLifetimeGuard<OutboundFileMessageBundle['view']>
    | ModelLifetimeGuard<OutboundImageMessageBundle['view']>
    | ModelLifetimeGuard<OutboundVideoMessageBundle['view']>
    | ModelLifetimeGuard<OutboundAudioMessageBundle['view']>;
export type AnyFileBasedMessageModelLifetimeGuard =
    | AnyFileBasedInboundMessageModelLifetimeGuard
    | AnyFileBasedOutboundMessageModelLifetimeGuard;

/**
 * Messages Storage.
 */
export type MessageRepository = {
    /**
     * Find all messages which contain the given text (case-insensitive). Note: Will not match
     * quotes contained in a message.
     */
    readonly findAllByText: (
        text: string,
        limit?: u53,
    ) => LocalSetStore<AnyNonDeletedMessageModelStore>;

    /**
     * Get all poll messages of type {@link PollMessageType.POLL_CREATED} limited by a numeric limit
     * (if any).
     */
    readonly getAllPolls: (limit?: u53) => LocalSetStore<PartialPollMessageViewSnapshot>;
} & ProxyMarked;

export type AnyNonDeletedMessageType = Exclude<MessageType, MessageType.DELETED>;

export type EditableMessageType = Exclude<AnyNonDeletedMessageType, MessageType.POLL>;
