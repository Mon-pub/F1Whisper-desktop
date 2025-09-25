import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {DbContactUid} from '~/common/db';

export interface StepTwoProps {
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly groupName: string;
    readonly onclickback?: (event: MouseEvent) => void;
    readonly oncontinue: (groupName: string) => Promise<void>;
    readonly selectedMembers: ReadonlySet<DbContactUid>;
    readonly services: Pick<AppServicesForSvelte, 'router' | 'settings' | 'profilePicture'>;
}
