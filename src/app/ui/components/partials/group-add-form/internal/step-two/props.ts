import type {AppServicesForSvelte} from '~/app/types';
import type {TopBarProps} from '~/app/ui/components/partials/group-add-form/internal/top-bar/props';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {DbContactUid} from '~/common/db';

export interface StepTwoProps extends TopBarProps {
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly groupName: string;
    readonly oncontinue: (groupName: string) => Promise<void>;
    readonly selectedMembers: ReadonlySet<DbContactUid>;
    readonly services: Pick<AppServicesForSvelte, 'router' | 'settings' | 'profilePicture'>;
}
