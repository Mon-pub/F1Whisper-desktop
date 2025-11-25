import type {AppServicesForSvelte} from '~/app/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {MessageContextMenuProviderProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-context-menu-provider/props';
import type {EmojiReactionsStripProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/internal/emoji-reactions-strip/props';
import type {MessageSender} from '~/app/ui/components/partials/conversation/internal/message-list/types';
import type {SanitizeAndParseTextToHtmlOptions} from '~/app/ui/utils/text';
import type {MessageId} from '~/common/network/types';
import type {SingleUnicodeEmoji, UnsupportedEmoji} from '~/common/utils/emoji';
import type {IQueryableStore} from '~/common/utils/store';
import type {PollData} from '~/common/viewmodel/conversation/main/message/regular-message/store/types';
import type {FeatureSupport} from '~/common/viewmodel/conversation/main/store/types';
import type {FileMessageDataState} from '~/common/viewmodel/types';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `RegularMessage` component.
 */
export interface RegularMessageProps {
    readonly boundary?: MessageContextMenuProviderProps['boundary'];
    readonly conversation: {
        readonly receiver: AnyReceiverData & {
            readonly closePoll: (
                pollData: Pick<PollData, 'pollCreatorIdentity' | 'pollId'>,
            ) => Promise<void>;
        };
        readonly editMessageFeatureSupport: FeatureSupport;
        readonly emojiReactionsFeatureSupport: FeatureSupport;
    };
    /**
     * Whether to play an animation to bring attention to the message. Resets to `false` when the
     * animation is completed.
     */
    readonly highlighted?: MessageProps['highlighted'];
    readonly onclickcontextmenufavoriteemoji?: (
        event: MouseEvent,
        emoji: SingleUnicodeEmoji,
    ) => void;
    readonly onclickdeleteoption?: MessageContextMenuProviderProps['onclickdeleteoption'];
    readonly onclickeditoption?: MessageContextMenuProviderProps['onclickeditoption'];
    readonly onclickemojireactionstripbucket?: (
        event: MouseEvent,
        emoji: SingleUnicodeEmoji | UnsupportedEmoji,
    ) => void;
    readonly onclickforwardoption?: MessageContextMenuProviderProps['onclickforwardoption'];
    readonly onclickopendetailsoption?: MessageContextMenuProviderProps['onclickopendetailsoption'];
    readonly onclickopenemojipicker?: (event: MouseEvent, anchorName: `--${string}`) => void;
    readonly onclickquote?: MessageProps['onclickquote'];
    readonly onclickquoteoption?: MessageContextMenuProviderProps['onclickquoteoption'];
    readonly onclickthumbnail?: MessageProps['onclickthumbnail'];
    readonly oncompletehighlightanimation?: MessageProps['oncompletehighlightanimation'];
    readonly options?: {
        /** Whether to always show the caret (instead of only on hover). Defaults to `false`. */
        readonly alwaysShowCaret?: boolean;
    };
    readonly services: AppServicesForSvelte;
    readonly store: IQueryableStore<RegularMessageDetails>;
}

interface RegularMessageDetails {
    readonly direction: MessageProps['direction'];
    readonly emojiReactions: EmojiReactionsStripProps['reactions'];
    readonly file?: Omit<NonNullable<MessageProps['file']>, 'thumbnail'> & {
        readonly sync: {
            /**
             * Whether the message content (i.e. file data) has been synced.
             */
            readonly state: FileMessageDataState['type'];
            /**
             * The sync direction for unsynced or syncing messages.
             */
            readonly direction: 'upload' | 'download' | undefined;
        };
        readonly thumbnail?: Omit<
            NonNullable<NonNullable<MessageProps['file']>['thumbnail']>,
            'thumbnailStore'
        >;
    };
    readonly id: MessageId;
    readonly pollData?: MessageProps['pollData'];
    readonly quote?: AnyQuotedMessage;
    readonly sender: MessageSender;
    readonly status: MessageProps['status'];
    readonly text?: TextContent;
}

export type AnyQuotedMessage = QuotedRegularMessage | QuotedDeletedMessage | 'not-found';

interface QuotedRegularMessage
    extends Omit<
            RegularMessageProps,
            | 'boundary'
            | 'conversation'
            | 'onClickContextMenuFavoriteEmoji'
            | 'onClickEmojiReactionStripBucket'
            | 'onClickOpenEmojiPicker'
            | 'services'
            | 'store'
        >,
        RegularMessageDetails {
    readonly type: 'regular-message';
}

interface QuotedDeletedMessage {
    readonly type: 'deleted-message';
    readonly id: MessageId;
}

interface TextContent {
    readonly mentions?: SanitizeAndParseTextToHtmlOptions['mentions'];
    /** Raw, unparsed, text. */
    readonly raw: string;
}
