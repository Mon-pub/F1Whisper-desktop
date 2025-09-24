import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {ProfilePictureColor} from '~/app/ui/svelte-components/threema/ProfilePicture';

export interface EditPictureModalProps extends Pick<ModalProps, 'onclose'> {
    readonly title: string;
    readonly color: ProfilePictureColor;
    readonly initials: string;
    readonly displayName: string;
    readonly blob?: Blob;
    readonly onsubmit: (img: Blob | undefined) => void;
}
