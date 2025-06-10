import type {AppServicesForSvelte} from '~/app/types';
import type {
    ContextMenuDivider,
    ContextMenuOption,
} from '~/app/ui/components/hocs/context-menu-provider/types';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';
import type {MessageSender} from '~/app/ui/components/partials/conversation/internal/message-list/types';
import type {ConversationPreviewProps} from '~/app/ui/components/partials/conversation-preview-list/internal/conversation-preview/props';
import type {CharmsProps} from '~/app/ui/components/partials/receiver-card/internal/content-item/internal/charms/props';
import type {IndicatorProps} from '~/app/ui/components/partials/receiver-card/internal/content-item/internal/indicator/props';
import type {ReceiverCardProps} from '~/app/ui/components/partials/receiver-card/props';
import type {SanitizeAndParseTextToHtmlOptions} from '~/app/ui/utils/text';
import type {u53} from '~/common/types';
import type {IQueryableStore} from '~/common/utils/store';
import type {AnyReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `ConversationPreviewList` component.
 */
export interface ConversationPreviewListProps<THandlerProps = undefined> {
    readonly contextMenuItems?:
        | ContextMenuItemWithHandlerProps<THandlerProps>[]
        | ((
              item: ConversationPreviewListItem<THandlerProps>,
          ) => ContextMenuItemWithHandlerProps<THandlerProps>[]);
    /**
     * Optional substring(s) to highlight in conversation preview text fields.
     */
    readonly highlights?: string | readonly string[];
    readonly items: IQueryableStore<ConversationPreviewListItem<THandlerProps>>[];
    readonly services: AppServicesForSvelte;
}

export interface ConversationPreviewListItem<THandlerProps>
    extends Omit<ConversationPreviewProps, 'active' | 'contextMenuOptions' | 'services' | 'store'> {
    /**
     * Additional data which the component will pass to callbacks (e.g., events or context menu
     * clicks).
     */
    readonly handlerProps: THandlerProps;
    readonly call?: CharmsProps['call'];
    readonly isArchived: boolean;
    readonly isPinned: boolean;
    readonly isTyping?: boolean;
    readonly isPrivate: boolean;
    readonly lastMessage?: {
        readonly direction: 'inbound' | 'outbound';
        readonly file?: Pick<NonNullable<MessageProps['file']>, 'type'>;
        readonly sender: MessageSender;
        readonly status: IndicatorProps['status'];
        readonly text?: TextContent;
        readonly pollData?: Pick<NonNullable<MessageProps['pollData']>, 'description'>;
    };
    readonly receiver: AnyReceiverData;
    readonly totalMessageCount: u53;
    readonly unreadMessageCount?: ReceiverCardProps['unreadMessageCount'];
}

export type ContextMenuItemWithHandlerProps<THandlerProps> =
    | ContextMenuOptionWithHandlerProps<THandlerProps>
    | ContextMenuDivider;

interface ContextMenuOptionWithHandlerProps<THandlerProps>
    extends Omit<ContextMenuOption, 'handler'> {
    readonly handler: (props: THandlerProps) => void;
}

interface TextContent {
    readonly mentions?: SanitizeAndParseTextToHtmlOptions['mentions'];
    /** Raw, unparsed, text. */
    readonly raw: string;
}
