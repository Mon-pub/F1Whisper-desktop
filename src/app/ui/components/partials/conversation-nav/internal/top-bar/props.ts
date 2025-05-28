import type {AppServicesForSvelte} from '~/app/types';
import type {ProfilePictureView} from '~/common/model';

/**
 * Props accepted by the `TopBar` component.
 */
export interface TopBarProps {
    readonly initials: string;
    readonly onclickprofilepicture?: (event: MouseEvent) => void;
    readonly onclickreceiverlistbutton?: (event: MouseEvent) => void;
    readonly onclicksettingsbutton?: () => void;
    readonly profilePicture: ProfilePictureView;
    readonly services: Pick<AppServicesForSvelte, 'router'>;
}
