import type {AppServicesForSvelte} from '~/app/types';
import type {TopBarProps} from '~/app/ui/components/partials/group-add-form/internal/top-bar/props';
import type {ReceiverPreviewListItem} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {DbContactUid, DbGroupUid} from '~/common/db';
import type {GroupInit} from '~/common/model';

/**
 * Props accepted by the `GroupAddForm` component.
 */
export interface GroupAddFormProps extends TopBarProps {
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
    readonly actions: {
        readonly createGroup?: (
            groupInit: Pick<GroupInit, 'name'>,
            members: ReadonlySet<DbContactUid>,
        ) => Promise<DbGroupUid | undefined>;
    };
    readonly contacts: Omit<ReceiverPreviewListItem<unknown>, 'interaction'>[];
}
