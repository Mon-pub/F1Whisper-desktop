import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {GroupReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `GroupContent` component.
 */
export interface GroupContentProps {
    readonly onclickitem?: ReceiverPreviewListProps['onclickitem'];
    readonly onclickprofilepicture?: (event: MouseEvent) => void;
    readonly receiver: GroupReceiverData;
    readonly services: Pick<AppServicesForSvelte, 'router' | 'settings' | 'profilePicture'>;
}
