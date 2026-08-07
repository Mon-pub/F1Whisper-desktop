import type {AppServicesForSvelte} from '~/app/types';
import type {ProfilePictureView} from '~/common/model';

/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly initials: string;
    /** F1Whisper fork: open the manage-chat-folders modal. */
    readonly onclickmanagefolders?: () => void;
    readonly onclickprofilepicture?: (event: MouseEvent) => void;
    readonly onclickreceiverlistbutton?: (event: MouseEvent) => void;
    readonly onclicksettingsbutton?: () => void;
    readonly profilePicture: ProfilePictureView;
    readonly services: Pick<AppServicesForSvelte, 'router' | 'settings' | 'storage'>;
}
