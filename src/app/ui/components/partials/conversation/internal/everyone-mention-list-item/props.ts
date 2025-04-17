import type {HTMLButtonAttributes} from 'svelte/elements';

import type {AppServicesForSvelte} from '~/app/types';
import type {GroupReceiverData} from '~/common/viewmodel/utils/receiver';

/**
 * Props accepted by the `EveryoneMentionListItem` component.
 */
export interface EveryoneMentionListItemProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    readonly receiver: GroupReceiverData;
    readonly services: Pick<AppServicesForSvelte, 'profilePicture'>;
}
