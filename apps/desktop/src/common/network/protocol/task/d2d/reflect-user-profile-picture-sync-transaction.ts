import type {u53} from '@threema/ts-utils/integer/u53';

import {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {ServicesForModel} from '~/common/model/types/common';
import {encryptAndUploadBlob} from '~/common/network/protocol/blob';
import {BLOB_FILE_NONCE} from '~/common/network/protocol/constants';
import {
    type ActiveTask,
    type ActiveTaskSymbol,
    ACTIVE_TASK,
    type ServicesForTasks,
    type ActiveTaskCodecHandle,
} from '~/common/network/protocol/task';
import {
    profilePictureGenerationsEqual,
    readProfilePictureGeneration,
    type ProfilePictureGeneration,
} from '~/common/network/protocol/task/common/user-profile-distribution';
import {getDeltaImageMessage} from '~/common/network/protocol/task/d2d';
import {ReflectUserProfilePictureSyncTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync';
import {transactionCompleted} from '~/common/network/protocol/task/manager';

export type UserProfileSyncTaskResult = 'success' | 'aborted';

const IN_FLIGHT_PROFILE_SYNCS = new WeakMap<
    ServicesForModel['taskManager'],
    {readonly generation: u53; readonly scheduled: Promise<unknown>}
>();

/** Queue at most one profile-sync task per task manager, coalescing newer offline generations. */
export function schedulePendingUserProfileSync(
    services: ServicesForModel,
    generation: u53,
    log: Logger,
): void {
    if (IN_FLIGHT_PROFILE_SYNCS.has(services.taskManager)) {
        return;
    }

    let scheduled: Promise<unknown>;
    try {
        scheduled = services.taskManager.schedule(
            new ReflectUserProfilePictureSyncTransactionTask(services, generation),
        );
    } catch (error) {
        log.warn(`Could not queue durable user-profile reflection: ${error}`);
        return;
    }
    IN_FLIGHT_PROFILE_SYNCS.set(services.taskManager, {generation, scheduled});
    void scheduled
        .catch((error: unknown) => {
            log.warn(`Durable user-profile reflection failed and remains pending: ${error}`);
        })
        .finally(() => {
            const inFlight = IN_FLIGHT_PROFILE_SYNCS.get(services.taskManager);
            if (inFlight?.scheduled !== scheduled) {
                return;
            }
            IN_FLIGHT_PROFILE_SYNCS.delete(services.taskManager);
            const pending = services.persistentProtocolState.getPendingUserProfileSync();
            if (pending !== undefined && pending.generation !== generation) {
                schedulePendingUserProfileSync(services, pending.generation, log);
            }
        });
}

/**
 * Re-plan and reflect one durable local profile generation inside a mediator transaction.
 */
export class ReflectUserProfilePictureSyncTransactionTask
    implements ActiveTask<UserProfileSyncTaskResult, 'persistent'>
{
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    /**
     * Create the transaction task.
     *
     * F1Whisper fork: upstream's constructor takes a precondition and a pre-reflect hook and the
     * caller awaits the result before persisting locally. This fork persists the local change and a
     * durable pending-sync row FIRST (offline edits must resolve immediately), so the task only
     * takes the generation of that row, re-plans the delta image from the current local state inside
     * `run`, and deletes the row once the reflection has been committed.
     *
     * @param _services Services required for tasks.
     * @param _generation Generation of the durable pending user-profile sync this task fulfils.
     */
    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _generation: u53,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.reflect-user-profile-sync-transaction`,
        );
    }

    public async run(
        handle: ActiveTaskCodecHandle<'persistent'>,
    ): Promise<UserProfileSyncTaskResult> {
        const prepared = await this._prepareCurrentProfileSync();
        if (prepared === undefined) {
            return 'aborted';
        }
        const precondition = (): boolean =>
            this._services.persistentProtocolState.hasPendingUserProfileSync(this._generation) &&
            profilePictureGenerationsEqual(
                readProfilePictureGeneration(this._services),
                prepared.profileGeneration,
            );
        const [state, reflected] = await handle.transaction(
            TransactionScope.USER_PROFILE_SYNC,
            precondition,
            async (state_) => {
                const task = new ReflectUserProfilePictureSyncTask<'persistent'>(
                    this._services,
                    state_,
                    prepared.deltaImage,
                    prepared.profileGeneration.shareWith,
                    precondition,
                );
                return await task.run(handle);
            },
        );
        const result = transactionCompleted(state) && reflected === true ? 'success' : 'aborted';
        if (result === 'success') {
            this._services.persistentProtocolState.deletePendingUserProfileSync(this._generation);
        }
        this._log.debug(`Transaction ${result}`);
        return result;
    }

    private async _prepareCurrentProfileSync(): Promise<
        | {
              readonly profileGeneration: ProfilePictureGeneration;
              readonly deltaImage: ReturnType<typeof getDeltaImageMessage>;
          }
        | undefined
    > {
        if (!this._services.persistentProtocolState.hasPendingUserProfileSync(this._generation)) {
            return undefined;
        }

        let profileGeneration = readProfilePictureGeneration(this._services);
        let profilePicture = this._services.model.user.profileSettings.get().view.profilePicture;
        if (
            profilePicture !== undefined &&
            (profilePicture.blobId === undefined ||
                profilePicture.key === undefined ||
                profilePicture.lastUploadedAt === undefined)
        ) {
            const uploadGeneration = profileGeneration;
            const blobInfo = await encryptAndUploadBlob(
                this._services,
                profilePicture.blob,
                BLOB_FILE_NONCE,
                'public-persistent',
            );
            if (
                !this._services.persistentProtocolState.hasPendingUserProfileSync(
                    this._generation,
                ) ||
                !profilePictureGenerationsEqual(
                    readProfilePictureGeneration(this._services),
                    uploadGeneration,
                )
            ) {
                return undefined;
            }
            this._services.model.user.profileSettings.get().controller.update.direct({
                profilePicture: {
                    blob: profilePicture.blob,
                    blobId: blobInfo.id,
                    key: blobInfo.key,
                    lastUploadedAt: new Date(),
                },
            });
            profileGeneration = readProfilePictureGeneration(this._services);
            profilePicture = this._services.model.user.profileSettings.get().view.profilePicture;
        }

        let deltaImage: ReturnType<typeof getDeltaImageMessage>;
        if (profilePicture === undefined) {
            deltaImage = getDeltaImageMessage({type: 'removed'});
        } else if (
            profilePicture.blobId !== undefined &&
            profilePicture.key !== undefined &&
            profilePicture.lastUploadedAt !== undefined
        ) {
            deltaImage = getDeltaImageMessage({
                type: 'set',
                blob: {
                    blobId: profilePicture.blobId,
                    key: profilePicture.key,
                    nonce: BLOB_FILE_NONCE,
                    uploadedAt: profilePicture.lastUploadedAt,
                },
            });
        } else {
            deltaImage = undefined;
        }
        if (deltaImage === undefined) {
            this._log.warn('Could not prepare current profile picture for durable reflection');
            return undefined;
        }
        return {profileGeneration, deltaImage};
    }
}
