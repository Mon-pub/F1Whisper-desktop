import type {DbConversationUid} from '~/common/db';
import type {ConversationCategory, MessageDirection} from '~/common/enum';
import type {FEATURE_MASK_FLAG, MessageId, StatusMessageId} from '~/common/network/types';
import type {u53} from '~/common/types';
import type {ConversationMessageSetStore} from '~/common/viewmodel/conversation/main/store';
import type {AnyCallData} from '~/common/viewmodel/utils/call';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Data to be supplied to the UI layer as part of the `ViewModelStore`. This should be as close as
 * possible to the `ConversationViewProps` that the conversation view component expects, excluding
 * props that only exist in the ui layer.
 */
export interface ConversationViewModel {
    readonly category: ConversationCategory;
    /**
     * The `MessageId` of the first (i.e. earliest) message that is still unread in the conversation.
     */
    readonly firstUnreadMessageId: MessageId | undefined;
    readonly call: AnyCallData | undefined;
    readonly id: DbConversationUid;
    readonly isArchived: boolean;
    readonly isPinned: boolean;
    readonly isPrivate: boolean;
    readonly isTyping: boolean;
    /**
     * F1Whisper fork (groups): display names of group members currently typing. Empty when nobody
     * is typing. Builder-ui renders e.g. "Alice is typing…" / "Alice, Bob are typing…".
     */
    readonly typingMemberNames: readonly string[];
    readonly lastMessage:
        | {
              readonly id: MessageId;
              readonly direction: MessageDirection;
          }
        | {
              readonly id: StatusMessageId;
              readonly direction: 'none';
          }
        | undefined;
    readonly messageSetStore: ConversationMessageSetStore;
    readonly receiver: AnyReceiverData;
    readonly supportedFeatures: FeatureMaskMap;
    readonly totalMessagesCount: u53;
    readonly unreadMessagesCount: u53;
    /**
     * F1Whisper fork: the current per-conversation disappearing-messages timer in seconds. `0` (or
     * undefined upstream) means disappearing is off. Used to pre-select the timer picker + reflect
     * header state.
     */
    readonly ephemeralTimerSeconds: u53;
    /**
     * F1Whisper fork: IDs of the pinned messages in this conversation, oldest-pinned first. For the
     * pinned-message banner (builder-ui cycles through them + jumps).
     */
    readonly pinnedMessageIds: readonly MessageId[];
}

/**
 * This map includes keys for every feature that is supported in a conversation. The associated
 * value includes the display names of contacts that do not yet support the feature (in case of
 * partial support).
 */
export type FeatureMaskMap = Map<
    (typeof FEATURE_MASK_FLAG)[keyof typeof FEATURE_MASK_FLAG],
    FeatureSupport
>;

export type FeatureSupport =
    | {readonly supported: false}
    | {readonly supported: true; readonly notSupportedNames: readonly string[]};
