import {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {WorkAvailabilityStatus} from '~/common/model/types/work-availability-status';
import {
    type ActiveTask,
    type ActiveTaskSymbol,
    ACTIVE_TASK,
    type ServicesForTasks,
    type ActiveTaskCodecHandle,
} from '~/common/network/protocol/task';
import {ReflectWorkAvailabilityStatusSyncTask} from '~/common/network/protocol/task/d2d/reflect-work-availability-status-sync';
import {transactionCompleted} from '~/common/network/protocol/task/manager';

export type WorkAvailabilityStatusSyncTaskResult = 'success' | 'aborted';

/**
 * Run the {@link ReflectWorkAvailabilityStatusTask} inside a transaction.
 */
export class ReflectWorkAvailabilityStatusSyncTransactionTask
    implements ActiveTask<WorkAvailabilityStatusSyncTaskResult, 'volatile'>
{
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = false;
    public readonly transaction = undefined;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _precondition: () => boolean,
        private readonly _workAvailabilityStatus: WorkAvailabilityStatus,
    ) {
        this._log = _services.logging.logger(
            `network.protocol.task.reflect-work-availability-status-sync-transaction`,
        );
    }

    public async run(
        handle: ActiveTaskCodecHandle<'volatile'>,
    ): Promise<WorkAvailabilityStatusSyncTaskResult> {
        const [state] = await handle.transaction(
            TransactionScope.USER_PROFILE_SYNC,
            this._precondition,
            async (state_) => {
                const task = new ReflectWorkAvailabilityStatusSyncTask(
                    this._services,
                    state_,
                    this._workAvailabilityStatus,
                );
                await task.run(handle);
            },
        );
        const result = transactionCompleted(state) ? 'success' : 'aborted';
        this._log.debug(`Transaction ${result}`);
        return result;
    }
}
