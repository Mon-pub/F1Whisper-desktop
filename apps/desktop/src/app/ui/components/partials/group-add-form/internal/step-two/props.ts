import type {AppServicesForSvelte} from '~/app/types';
import type {ReceiverPreviewListProps} from '~/app/ui/components/partials/receiver-preview-list/props';
import type {ProfilePictureColor} from '~/app/ui/svelte-components/threema/ProfilePicture';
import type {DbContactUid} from '~/common/db';

export interface StepTwoProps {
    readonly contacts: ReceiverPreviewListProps<unknown>['items'];
    readonly groupName: string;
    readonly onclickback?: (event: MouseEvent) => void;
    readonly onclickcancel: (event: MouseEvent) => void;
    readonly oncontinue: (
        groupName: string,
        profilePictureBytes: Blob | undefined,
    ) => Promise<void>;
    /** The color to be used in the profile picture placeholder. Defaults to `teal`. */
    readonly placeholderColor?: ProfilePictureColor;
    readonly selectedMembers: ReadonlySet<DbContactUid>;
    readonly services: Pick<AppServicesForSvelte, 'router' | 'settings' | 'profilePicture'>;
}
