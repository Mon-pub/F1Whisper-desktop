import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';

import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
import type {ProfilePictureColor} from '~/app/ui/svelte-components/threema/ProfilePicture';

/**
 * Props accepted by the `ProfilePictureModal` component.
 */
export interface ProfilePictureModalProps extends Pick<ModalProps, 'onclose'> {
    readonly alt: string;
    readonly color: ProfilePictureColor;
    readonly initials: string;
    readonly pictureBytes?: ReadonlyUint8Array;
}
