import type {ProfilePictureColor} from '~/app/ui/svelte-components/threema/ProfilePicture';
import type {ReadonlyUint8Array} from '~/common/types';

/**
 * Props accepted by the `ProfileInfo` component.
 */
export interface ProfileInfoProps {
    readonly color: ProfilePictureColor;
    readonly displayName: string;
    /**
     * The current nickname, or `undefined` when none is set (i.e. {@link displayName} falls back to
     * the Threema ID). Used to pre-fill the edit-nickname modal.
     */
    readonly nickname?: string;
    readonly initials: string;
    readonly pictureBytes?: ReadonlyUint8Array;
    readonly onclickprofilepicture?: (event: MouseEvent) => void;
    readonly updateProfilePicture: (img: Blob | undefined) => void;
    readonly updateNickname: (nickname: string) => void;
}
