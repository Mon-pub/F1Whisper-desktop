import {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type * as protobuf from '~/common/network/protobuf';
import type {ProtobufMessage} from '~/common/network/protobuf/tag';
import {
    type ActiveTask,
    type ActiveTaskSymbol,
    ACTIVE_TASK,
    type ServicesForTasks,
    type ActiveTaskCodecHandle,
} from '~/common/network/protocol/task';
import {ReflectUserProfilePictureSyncTask} from '~/common/network/protocol/task/d2d/reflect-user-profile-picture-sync';
import {transactionCompleted} from '~/common/network/protocol/task/manager';
import type {WeakOpaque} from '~/common/types';

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

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _precondition: () => boolean,
        private readonly _deltaImage: WeakOpaque<protobuf.common.DeltaImage, ProtobufMessage>,
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
                const task = new ReflectUserProfilePictureSyncTask(
                    this._services,
                    state_,
                    this._deltaImage,
                );
                await task.run(handle);
            },
        );
        const result = transactionCompleted(state) ? 'success' : 'aborted';
        this._log.debug(`Transaction ${result}`);
        return result;
    }
}
