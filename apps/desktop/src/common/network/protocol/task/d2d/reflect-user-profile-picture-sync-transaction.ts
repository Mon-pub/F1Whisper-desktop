import {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import {
    type ActiveTask,
    type ActiveTaskSymbol,
    ACTIVE_TASK,
    type ServicesForTasks,
    type ActiveTaskCodecHandle,
} from '~/common/network/protocol/task';
import type {DeltaImage} from '~/common/network/protocol/task/d2d/group-sync-helper';
import {ReflectUserProfilePictureSyncTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync';
import {transactionCompleted} from '~/common/network/protocol/task/manager';

export type UserProfileSyncTaskResult = 'success' | 'aborted';

/**
 * Run the {@link ReflectUserProfileTask} inside a transaction.
 */
export class ReflectUserProfilePictureSyncTransactionTask
    implements ActiveTask<UserProfileSyncTaskResult, 'volatile'>
{
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    /**
     * Create the transaction task.
     *
     * @param _services Services required for tasks.
     * @param _precondition Precondition that must still hold for the transaction to proceed.
     * @param _preReflectHook Logic to run before the profile picture is reflected, inside the
     *   (open, not yet committed) transaction. Expected to return the {@link DeltaImage} to
     *   reflect.
     */
    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _precondition: () => boolean,
        private readonly _preReflectHook: () => Promise<DeltaImage> | DeltaImage,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.reflect-user-profile-sync-transaction`,
        );
    }

    public async run(
        handle: ActiveTaskCodecHandle<'volatile'>,
    ): Promise<UserProfileSyncTaskResult> {
        const [state] = await handle.transaction(
            TransactionScope.USER_PROFILE_SYNC,
            this._precondition,
            async (state_) => {
                const deltaImage = await this._preReflectHook();
                const task = new ReflectUserProfilePictureSyncTask(
                    this._services,
                    state_,
                    deltaImage,
                );
                await task.run(handle);
            },
        );
        const result = transactionCompleted(state) ? 'success' : 'aborted';
        this._log.debug(`Transaction ${result}`);
        return result;
    }
}
