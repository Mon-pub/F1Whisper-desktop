import type {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import * as protobuf from '~/common/network/protobuf';
import type {ProtobufMessage} from '~/common/network/protobuf/tag';
import {D2mMessageFlags} from '~/common/network/protocol/flags';
import type {
    ComposableTask,
    ActiveTaskCodecHandle,
    ServicesForTasks,
    TransactionRunning,
} from '~/common/network/protocol/task';
import type {WeakOpaque} from '~/common/types';

export class ReflectUserProfilePictureSyncTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        transaction: TransactionRunning<TransactionScope.USER_PROFILE_SYNC>, // Ensures transaction is running
        private readonly _deltaImage: WeakOpaque<protobuf.common.DeltaImage, ProtobufMessage>,
    ) {
        this._log = this._services.logging.logger(
            `network.protocol.task.reflect-user-profile-sync`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        const userProfileSync = protobuf.utils.creator(protobuf.d2d.UserProfileSync, {
            update: protobuf.utils.creator(protobuf.d2d.UserProfileSync.Update, {
                userProfile: protobuf.utils.creator(protobuf.d2d_sync.UserProfile, {
                    nickname: undefined,
                    profilePicture: this._deltaImage,
                    profilePictureShareWith: undefined,
                    identityLinks: undefined,
                }),
            }),
        });

        this._log.info(`Syncing user profile picture to other devices`);
        await handle.reflect([{envelope: {userProfileSync}, flags: D2mMessageFlags.none()}]);
    }
}
