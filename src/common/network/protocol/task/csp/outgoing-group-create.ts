import {GroupUserState, TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {GroupInit} from '~/common/model';
import type {ContactModelStore} from '~/common/model/contact';
import {groupDebugString, type GroupModelStore} from '~/common/model/group';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {ActiveGroupUpdateTask} from '~/common/network/protocol/task/csp/active-group-update';
import {transactionCompleted} from '~/common/network/protocol/task/manager';
import {randomMessageId} from '~/common/network/protocol/utils';

function equalContactSetAndArray(
    contactSet: ReadonlySet<ContactModelStore>,
    contactArray: ContactModelStore[],
): boolean {
    return (
        contactSet.size === contactArray.length &&
        contactArray.reduce((prev, cur) => prev && contactSet.has(cur), true)
    );
}

export class OutgoingGroupCreateTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;

    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _groupInit: GroupInit,
        private readonly _members: ReadonlySet<ContactModelStore>,
        private readonly _group: GroupModelStore,
    ) {
        const groupString = groupDebugString(
            this._services.device.identity.string,
            this._group.get().view.groupId,
        );
        this._log = this._services.logging.logger(
            `network.protocol.task.outgoing-group-create.${groupString}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const messageIds = [
            randomMessageId(this._services.crypto),
            randomMessageId(this._services.crypto),
            randomMessageId(this._services.crypto),
            randomMessageId(this._services.crypto),
        ] as const;

        const transactionResult = await handle.transaction(
            TransactionScope.GROUP_SYNC,
            // Precondition: If the group does not exist or the group is marked as left or the group
            // has no members, log a warning that a group sync race occurred and abort these steps.
            () =>
                this._services.model.groups.getByUid(this._group.ctx) !== undefined &&
                this._group.get().view.userState === GroupUserState.MEMBER &&
                this._group.get().view.members.size > 0,
            async () => {
                const group = this._group.get();
                if (this._groupInit.name !== group.view.name) {
                    this._log.info('A group sync race occurred, the group names do not match');
                }
                if (!equalContactSetAndArray(group.view.members, [...this._members])) {
                    this._log.info('A group sync race occurred, the members do not match');
                }

                return await new ActiveGroupUpdateTask(this._services, this._group, messageIds, {
                    addMembers: this._members,
                    removeMembers: new Set(),
                    // TODO(DESK-1775): Implement profile pictures.
                    profilePicture: undefined,
                }).run(handle);
            },
        );

        if (!transactionCompleted(transactionResult[0])) {
            this._log.error('Could not finish transaction, precondition failed');
        }
    }
}
