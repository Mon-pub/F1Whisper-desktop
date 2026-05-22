import {type TransactionScope, WorkAvailabilityStatusCategory} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import * as protobuf from '~/common/network/protobuf';
import {D2mMessageFlags} from '~/common/network/protocol/flags';
import type {
    ComposableTask,
    ActiveTaskCodecHandle,
    ServicesForTasks,
    TransactionRunning,
} from '~/common/network/protocol/task';

export class ReflectWorkAvailabilityStatusSyncTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        transaction: TransactionRunning<TransactionScope.USER_PROFILE_SYNC>, // Ensures transaction is running
        private readonly _workAvailabilityStatus: WorkAvailabilityStatus,
    ) {
        this._log = this._services.logging.logger(
            `network.protocol.task.reflect-work-availability-status-sync`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        const userProfileSync = protobuf.utils.creator(protobuf.d2d.UserProfileSync, {
            update: protobuf.utils.creator(protobuf.d2d.UserProfileSync.Update, {
                userProfile: protobuf.utils.creator(protobuf.d2d_sync.UserProfile, {
                    nickname: undefined,
                    profilePicture: undefined,
                    profilePictureShareWith: undefined,
                    identityLinks: undefined,
                    workAvailabilityStatus: protobuf.utils.creator(
                        protobuf.d2d_sync.WorkAvailabilityStatus,
                        {
                            category: this._workAvailabilityStatus.category,
                            // Per protocol, "No status" must not carry a description.
                            description:
                                this._workAvailabilityStatus.category ===
                                WorkAvailabilityStatusCategory.NONE
                                    ? ''
                                    : this._workAvailabilityStatus.description,
                        },
                    ),
                }),
            }),
        });

        this._log.info(`Syncing work availability status to other devices`);
        await handle.reflect([{envelope: {userProfileSync}, flags: D2mMessageFlags.none()}]);
    }
}
