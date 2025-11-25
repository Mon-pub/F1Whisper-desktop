import type {Snippet} from 'svelte';
import type {HTMLButtonAttributes} from 'svelte/elements';

import type {ContextMenuItem} from '~/app/ui/components/hocs/context-menu-provider/types';

/**
 * Props accepted by the `KeyValueList.ItemWithDropdown` component.
 */
export interface ItemWithDropdownProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    readonly children?: Snippet;
    readonly items: ContextMenuItem[];
    /**
     * The key of the list item. Note: Will be used as the title.
     */
    readonly key: string;
    readonly onclickinfoicon?: (event: MouseEvent) => void;
    readonly options?: {
        readonly showInfoIcon?: boolean;
        readonly disabled?: boolean;
    };
}
