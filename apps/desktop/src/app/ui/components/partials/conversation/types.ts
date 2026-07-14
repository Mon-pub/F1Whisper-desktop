import type * as v from '@badrap/valita';

import type {ROUTE_DEFINITIONS} from '~/app/routing/routes';
import type {QuoteProps} from '~/app/ui/components/molecules/message/internal/quote/props';
import type {ComposeBarProps} from '~/app/ui/components/partials/conversation/internal/compose-bar/props';
import type {
    AnyMessageListMessageStore,
    MessageListRegularMessage,
} from '~/app/ui/components/partials/conversation/internal/message-list/props';
import type {MediaFile} from '~/app/ui/modal/media-message';
import type {MessageId} from '~/common/network/types';
import type {u53} from '~/common/types';
import type {Remote} from '~/common/utils/endpoint';
import type {IQueryableStoreValue} from '~/common/utils/store';
import type {ConversationViewModelBundle} from '~/common/viewmodel/conversation/main';

/**
 * Shape of the router's route params if it's a "conversation" route.
 */
export type ConversationRouteParams = v.Infer<
    (typeof ROUTE_DEFINITIONS)['main']['conversation']['params']
>;

/**
 * Type of the value contained in a `ConversationViewModelStore` transferred from {@link Remote}.
 */
export type RemoteConversationViewModelStoreValue = ReturnType<
    Remote<ConversationViewModelBundle>['viewModelStore']['get']
>;

export type ModalState =
    | NoneModalState
    | ClearConversationModalState
    | CreatePollModalState
    | DeleteMessageModalState
    | DisappearingMessagesModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface ClearConversationModalState {
    readonly type: 'media-compose';
    readonly props: {
        readonly title: string;
        readonly mediaFiles: MediaFile[];
        readonly visible: boolean;
        readonly enterKeyMode: 'submit' | 'newline';
    };
}

interface DeleteMessageModalState {
    readonly type: 'delete-message';
    readonly props: IQueryableStoreValue<AnyMessageListMessageStore>;
}

interface CreatePollModalState {
    readonly type: 'create-poll';
}

interface DisappearingMessagesModalState {
    readonly type: 'disappearing-messages';
    readonly props: {
        /** The currently configured timer in seconds (0 = off), to pre-select in the picker. */
        readonly currentTimerSeconds: u53;
    };
}

export type EditedMessage = Pick<MessageListRegularMessage, 'actions' | 'id' | 'text'>;
export interface QuotedMessage {
    readonly id: MessageId;
    readonly props: QuoteProps;
}

/**
 * Base compose bar type.
 */
interface ComposeBarMode {
    readonly type: ComposeBarProps['mode'];
    readonly editedMessage: EditedMessage | undefined;
    readonly quotedMessage: QuotedMessage | undefined;
    readonly mentionString: string | undefined;
    readonly emojiSearchString: string | undefined;
}

/**
 * Union of compose bar types. There are three modes: Quote, Edit and Normal
 */
export type ComposeBarState =
    | ComposeBarQuote
    | ComposeBarEdit
    | ComposeBarDefault
    | ComposeBarMention
    | ComposeBarInlineEmoji
    | ComposeBarRecord;

/**
 * Standard compose bar behaviour. Text can be inserted and no quote nor edit mode is activated.
 */
export interface ComposeBarDefault extends ComposeBarMode {
    readonly type: 'insert';
}

/**
 * Use the compose bar to quote a message.
 */
export interface ComposeBarQuote extends ComposeBarMode {
    readonly type: 'quote';
    readonly quotedMessage: QuotedMessage;
}

/**
 * Use the compose bar to edit messages. The quoted message is used so that the message to edit can be displayed properly even if e.g. a preview is there.
 */
export interface ComposeBarEdit extends ComposeBarMode {
    readonly type: 'edit';
    readonly editedMessage: EditedMessage;
    readonly quotedMessage: QuotedMessage;
}

/**
 * Use the compose bar to mention a user in a group conversation.
 */
export interface ComposeBarMention extends ComposeBarMode {
    readonly type: 'insert';
    readonly mentionString: string;
}

export interface ComposeBarInlineEmoji extends ComposeBarMode {
    readonly type: 'insert';
    readonly emojiSearchString: string;
}

/**
 * Use the compose bar to record a voice message.
 */
export interface ComposeBarRecord extends ComposeBarMode {
    readonly type: 'record';
}
