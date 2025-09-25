import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {DbContactUid, DbGroupUid} from '~/common/db';
import type {GroupInit} from '~/common/model';

/**
 * Props accepted by the `GroupAddForm` component.
 */
export interface GroupAddFormProps {
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
    readonly actions: {
        readonly createGroup?: (
            groupInit: Pick<GroupInit, 'name'>,
            members: ReadonlySet<DbContactUid>,
        ) => Promise<DbGroupUid | undefined>;
    };
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly onclickcancel?: (event: MouseEvent) => void;
}
