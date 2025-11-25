import type {AppServicesForSvelte} from '~/app/types';
import type {ContextMenuProviderProps} from '~/app/ui/components/hocs/context-menu-provider/props';
import type {ConversationPreviewListItem} from '~/app/ui/components/partials/conversation-preview-list/props';
import type {ReceiverCardProps} from '~/app/ui/components/partials/receiver-card/props';
import type {IQueryableStore} from '~/common/utils/store';

/**
 * Props accepted by the `ConversationPreview` component.
 */
export interface ConversationPreviewProps {
    readonly active: boolean;
    readonly contextMenuOptions?: Omit<ContextMenuProviderProps, 'popover'>;
    /**
     * Optional substring(s) to highlight in conversation preview text fields.
     */
    readonly highlights?: string | readonly string[];
    readonly onclick?: (event: MouseEvent) => void;
    readonly onclickjoincall?: ReceiverCardProps['onclickjoincall'];
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
    readonly store: IQueryableStore<ConversationPreviewListItem<unknown>>;
}
