import type {AppServicesForSvelte} from '~/app/types';
import type {
    ContextMenuDivider,
    ContextMenuOption,
} from '~/app/ui/components/hocs/context-menu-provider/types';
import type {ReceiverPreviewProps} from '~/app/ui/components/partials/receiver-preview-list/internal/receiver-preview/props';
import type {ReceiverPreviewListId} from '~/app/ui/components/partials/receiver-preview-list/types';
import type {DbReceiverLookup} from '~/common/db';
import type {IQueryableStore} from '~/common/utils/store';
import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `ReceiverPreviewList` component.
 */
export interface ReceiverPreviewListProps<THandlerProps = undefined> {
    readonly contextMenuItems?:
        | ContextMenuItemWithHandlerProps<THandlerProps>[]
        | ((
              item: ReceiverPreviewListItem<THandlerProps>,
          ) => ContextMenuItemWithHandlerProps<THandlerProps>[]);
    /**
     * Optional substring(s) to highlight in receiver preview text fields.
     */
    readonly highlights?: string | readonly string[];
    readonly items: IQueryableStore<ReceiverPreviewListItem<THandlerProps>>[];
    /**
     * Called when a list item in interaction mode `"click"` is clicked. Note: This is intended as a
     * convenient alternative to setting an `onclick` handler for each clickable item separately.
     */
    readonly onclickitem?: (item: {
        readonly lookup: DbReceiverLookup;
        readonly active: boolean;
    }) => void;
    /**
     * Called when a list item in interaction mode `"select"` is selected. Note: This is intended as
     * a convenient alternative to setting an `onselect` handler for each selectable item
     * separately.
     */
    readonly onselectitem?: (selected: boolean, item: {readonly lookup: DbReceiverLookup}) => void;
    /**
     * Called whenever a new item enters the viewport. Note: This is debounced because it could get
     * called a large number of times if the user is scrolling quickly.
     */
    readonly onitementereddebounced?: (id: ReceiverPreviewListId) => void;
    readonly options?: {
        /**
         * Whether receivers whose conversation is currently open should be marked as `active`.
         * Defaults to `true` if the given item's `interaction` mode is `"click"`, else to `false`.
         */
        readonly highlightActiveReceiver?: boolean;
    };
    readonly services: Pick<AppServicesForSvelte, 'router' | 'settings' | 'profilePicture'>;
}

export interface ReceiverPreviewListItem<THandlerProps>
    extends Omit<ReceiverPreviewProps, 'active' | 'contextMenuOptions' | 'services' | 'store'> {
    /**
     * Additional data belonging to a list item, which will be passed to to each context menu item
     * handler callback.
     */
    readonly handlerProps: THandlerProps;
    /**
     * A unique id for the lazy list to identify the element.
     */
    readonly id: ReceiverPreviewListId;
    /**
     * The `ReceiverData` to render as a preview. Note: If the receiver is self, the
     * `ReceiverPreview` will not be clickable or selectable.
     */
    readonly receiver: AnyReceiverDataOrSelf & {
        /**
         * Whether to display a special badge to show that this receiver is a group creator.
         */
        readonly isCreator?: boolean;
    };
}

export type ContextMenuItemWithHandlerProps<THandlerProps> =
    | ContextMenuOptionWithHandlerProps<THandlerProps>
    | ContextMenuDivider;

interface ContextMenuOptionWithHandlerProps<THandlerProps>
    extends Omit<ContextMenuOption, 'handler'> {
    readonly handler: (props: THandlerProps) => void;
}
