import type {AppServicesForSvelte} from '~/app/types';
import type {ContextMenuProviderProps} from '~/app/ui/components/hocs/context-menu-provider/props';
import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `ReceiverPreview` component.
 */
export interface ReceiverPreviewProps {
    readonly active: boolean;
    readonly contextMenuOptions?: Omit<ContextMenuProviderProps, 'popover'>;
    /**
     * Optional substring(s) to highlight in conversation preview text fields.
     */
    readonly highlights?: string | readonly string[];
    /**
     * The interaction mode of the component, e.g. whether it is clickable, selectable, or not.
     * Defaults to `"none"`.
     */
    readonly interaction?: InteractionMode;
    readonly options?: {
        /**
         * Whether this receiver should be highlighted when it is marked as `active`. Defaults to
         * `true` if the `interaction` mode is `"click"`, else to `false`.
         */
        readonly highlightWhenActive?: boolean;
    };
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
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
}

type InteractionMode = InteractionModeNone | InteractionModeClick | InteractionModeSelect;

/**
 * Config for the non-interactive mode of the `ReceiverPreview` component, which means the component
 * cannot be interacted with.
 */
interface InteractionModeNone {
    readonly mode: 'none';
}

/**
 * Config for the clickable mode of the `ReceiverPreview` component, which means the component can
 * be clicked and will emit `onclick` events.
 */
interface InteractionModeClick {
    readonly mode: 'click';
    readonly onclick?: (event: MouseEvent) => void;
}

/**
 * Config for the selectable mode of the `ReceiverPreview` component, which means the component can
 * be marked as selected by toggling a checkbox.
 *
 * Note: The selection state needs to be managed by the parent by handling the `onselect` event and
 * updating `isSelected` accordingly.
 */
interface InteractionModeSelect {
    readonly mode: 'select';
    readonly isSelected: boolean;
    readonly onselect?: (selected: boolean) => void;
}
