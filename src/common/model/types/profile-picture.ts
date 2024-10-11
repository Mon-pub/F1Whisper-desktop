import type {ControllerCustomUpdate, ControllerUpdate, Model} from '~/common/model/types/common';
import type {ModelLifetimeGuard} from '~/common/model/utils/model-lifetime-guard';
import type {BlobId} from '~/common/network/protocol/blob';
import type {RawBlobKey} from '~/common/network/types/keys';
import type {ReadonlyUint8Array} from '~/common/types';
import type {ProxyMarked} from '~/common/utils/endpoint';
import type {IdColor} from '~/common/utils/id-color';

export interface ProfilePictureView {
    readonly color: IdColor;
    readonly picture?: ReadonlyUint8Array;
}
export type ProfilePictureSource =
    | 'contact-defined'
    | 'gateway-defined'
    | 'user-defined'
    | 'admin-defined';
export type ProfilePictureController = {
    readonly lifetimeGuard: ModelLifetimeGuard<ProfilePictureView>;

    /**
     * Update the profile picture from a certain picture `source`.
     *
     * Note: FromRemote will result in a `ContactSync` being reflected if this is a contact. If this
     * is a group, on the other hand, calling fromRemote will not lead to any reflection.
     *
     * TODO(DESK-1703): Improve this API and documentation so that the caller doesn't have to make
     * speculations about side effects.
     */
    readonly setPicture: ControllerCustomUpdate<
        [profilePicture: ReadonlyUint8Array, source: ProfilePictureSource], // FromLocal
        [profilePicture: ReadonlyUint8Array, source: ProfilePictureSource], // FromSync
        [
            // FromRemote
            profilePicture: {
                readonly bytes: ReadonlyUint8Array;
                readonly blobId: BlobId;
                readonly blobKey: RawBlobKey;
            },
            source: ProfilePictureSource,
        ],
        [profilePicture: ReadonlyUint8Array, source: ProfilePictureSource] // Direct
    >;

    /**
     * Remove the profile picture from a certain picture `source`.
     */
    readonly removePicture: ControllerUpdate<[source: ProfilePictureSource]>;
} & ProxyMarked;
export type ProfilePicture = Model<ProfilePictureView, ProfilePictureController>;
