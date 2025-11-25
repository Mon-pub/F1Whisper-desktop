import type {ProfilePictureBlobStoreValue} from '~/common/dom/ui/profile-picture';
import type {IQueryableStore} from '~/common/utils/store';

export interface EditPictureCanvasProps {
    readonly profilePictureStore: IQueryableStore<ProfilePictureBlobStoreValue>;
    readonly ondirty: () => void;
}
