import type {Snippet} from 'svelte';

import type {
    ContextMenuItem,
    ContextMenuOption,
} from '~/app/ui/components/hocs/context-menu-provider/types';
import type Popover from '~/app/ui/generic/popover/Popover.svelte';
import type {PopoverProps} from '~/app/ui/generic/popover/props';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

/**
 * Props accepted by the `ContextMenuProvider` component.
 */
export interface ContextMenuProviderProps<THandlerProps = undefined>
    extends Omit<PopoverProps, 'element' | 'safetyGap' | 'snippetPopover' | 'snippetTrigger'> {
    /**
     * Optional snippet to display as the header of the context menu (i.e., before any context menu
     * items).
     */
    readonly snippetBefore?: Snippet;
    /**
     * Optional snippet to display as the trigger's children.
     */
    readonly children?: Snippet;
    /**
     * Options to show in the context menu. If empty, no context menu will be rendered.
     */
    readonly items: readonly ContextMenuItem<THandlerProps>[] | undefined;
    readonly onclickitem?: (item: ContextMenuOption<THandlerProps>) => void;
    readonly popover?: SvelteNullableBinding<Popover>;
    /**
     * @see {@link PopoverProps.safetyGap}. Defaults to `{left: 8, right: 8, top: 8, bottom: 8}`.
     */
    readonly safetyGap?: PopoverProps['safetyGap'];
}
