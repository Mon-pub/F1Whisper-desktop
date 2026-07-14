import type {EditNicknameModalProps} from '~/app/ui/components/partials/modals/edit-nickname-modal/props';
import type {EditPictureModalProps} from '~/app/ui/components/partials/modals/edit-picture-modal/props';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';

export type ProfilePictureShareWithOptions = ProfilePictureShareWith[keyof ProfilePictureShareWith];

export type ModalState = NoneModalState | EditPictureModalState | EditNicknameModalState;

interface NoneModalState {
    readonly type: 'none';
}

interface EditPictureModalState {
    readonly type: 'picture';
    readonly props: EditPictureModalProps;
}

interface EditNicknameModalState {
    readonly type: 'nickname';
    readonly props: EditNicknameModalProps;
}
