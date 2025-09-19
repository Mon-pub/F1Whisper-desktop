import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {DbContactUid, DbGroupUid} from '~/common/db';
import type {GroupInit} from '~/common/model';
import type {ReadonlyUint8Array} from '~/common/types';

/**
 * Props accepted by the `GroupAddForm` component.
 */
export interface GroupAddFormProps {
    readonly services: Pick<AppServicesForSvelte, 'profilePicture' | 'router' | 'settings'>;
    readonly actions: {
        readonly createGroup?: (
            groupInit: Pick<GroupInit, 'name'>,
            members: ReadonlySet<DbContactUid>,
            profilePicture: ReadonlyUint8Array | undefined,
        ) => Promise<DbGroupUid | undefined>;
    };
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly onclickcancel: (event: MouseEvent) => void;
    readonly onclickformcancel?: (event: MouseEvent) => void;
}
