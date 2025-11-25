import type {EditPictureModalProps} from '~/app/ui/components/partials/modals/edit-picture-modal/props';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';

export type ProfilePictureShareWithOptions = ProfilePictureShareWith[keyof ProfilePictureShareWith];

export type ModalState = NoneModalState | EditPictureModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface EditPictureModalState {
    readonly type: 'picture';
    readonly props: EditPictureModalProps;
}
