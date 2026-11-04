import type {ProtobufMessage} from '@threema/protocol/protobuf/tag';
import type {WeakOpaque} from '@threema/ts-utils/meta/newtype';

import type {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {ProfilePictureShareWith} from '~/common/model/settings/profile';
import * as protobuf from '~/common/network/protobuf';
import {D2mMessageFlags} from '~/common/network/protocol/flags';
import type {
    ActiveTaskPersistence,
    ComposableTask,
    ActiveTaskCodecHandle,
    ServicesForTasks,
    TransactionRunning,
} from '~/common/network/protocol/task';
import {unreachable} from '~/common/utils/assert';

export class ReflectUserProfilePictureSyncTask<TPersistence extends ActiveTaskPersistence>
    implements ComposableTask<ActiveTaskCodecHandle<TPersistence>, boolean>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        transaction: TransactionRunning<TransactionScope.USER_PROFILE_SYNC>, // Ensures transaction is running
        private readonly _deltaImage:
            | WeakOpaque<protobuf.common.DeltaImage, ProtobufMessage>
            | undefined,
        private readonly _profilePictureShareWith: ProfilePictureShareWith,
        private readonly _precondition: () => boolean,
    ) {
        this._log = this._services.logging.logger(
            `network.protocol.task.reflect-user-profile-sync`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<TPersistence>): Promise<boolean> {
        let profilePictureShareWith: protobuf.d2d_sync.UserProfile.ProfilePictureShareWithEncodable;
        switch (this._profilePictureShareWith.group) {
            case 'nobody':
                profilePictureShareWith = protobuf.utils.creator(
                    protobuf.d2d_sync.UserProfile.ProfilePictureShareWith,
                    {
                        nobody: protobuf.UNIT_MESSAGE,
                        everyone: undefined,
                        allowList: undefined,
                    },
                );
                break;
            case 'everyone':
                profilePictureShareWith = protobuf.utils.creator(
                    protobuf.d2d_sync.UserProfile.ProfilePictureShareWith,
                    {
                        nobody: undefined,
                        everyone: protobuf.UNIT_MESSAGE,
                        allowList: undefined,
                    },
                );
                break;
            case 'allowList':
                profilePictureShareWith = protobuf.utils.creator(
                    protobuf.d2d_sync.UserProfile.ProfilePictureShareWith,
                    {
                        nobody: undefined,
                        everyone: undefined,
                        allowList: protobuf.utils.creator(protobuf.common.Identities, {
                            identities: this._profilePictureShareWith.allowList,
                        }),
                    },
                );
                break;
            default:
                unreachable(this._profilePictureShareWith);
        }
        const userProfileSync = protobuf.utils.creator(protobuf.d2d.UserProfileSync, {
            update: protobuf.utils.creator(protobuf.d2d.UserProfileSync.Update, {
                userProfile: protobuf.utils.creator(protobuf.d2d_sync.UserProfile, {
                    nickname: undefined,
                    profilePicture: this._deltaImage,
                    profilePictureShareWith,
                    identityLinks: undefined,
                    workAvailabilityStatus: undefined,
                }),
            }),
        });

        this._log.info(`Syncing user profile picture to other devices`);
        const [reflectedAt] = await handle.reflect([
            {
                envelope: {userProfileSync},
                flags: D2mMessageFlags.none(),
                precondition: this._precondition,
            },
        ]);
        return reflectedAt !== undefined;
    }
}
