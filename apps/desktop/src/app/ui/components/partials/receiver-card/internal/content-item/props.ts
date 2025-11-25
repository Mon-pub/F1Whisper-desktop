import type {CharmsProps} from '~/app/ui/components/partials/receiver-card/internal/content-item/internal/charms/props';
import type {AnyContentItemOptions} from '~/app/ui/components/partials/receiver-card/internal/content-item/types';

/**
 * Props accepted by the `ContentItem` component.
 */
export interface ContentItemProps {
    readonly onclickjoincall?: CharmsProps['onclickjoincall'];
    readonly options: AnyContentItemOptions;
}
