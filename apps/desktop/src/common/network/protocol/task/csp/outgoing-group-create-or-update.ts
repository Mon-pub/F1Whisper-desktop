import {TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {ContactModelStore} from '~/common/model/contact';
import {groupDebugString} from '~/common/model/group';
import type {GroupCreateOrUpdateFromLocal} from '~/common/model/types/group';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {
    ActiveGroupUpdateTask,
    type CspProfilePictureUpdate,
} from '~/common/network/protocol/task/csp/active-group-update';
import {transactionCompleted} from '~/common/network/protocol/task/manager';
import {randomMessageId} from '~/common/network/protocol/utils';
import type {GroupId} from '~/common/network/types';
import {assert, unreachable} from '~/common/utils/assert';
import {byteEquals} from '~/common/utils/byte';

function equalContactSetAndArray(
    contactSet: ReadonlySet<ContactModelStore>,
    contactArray: ContactModelStore[],
): boolean {
    return (
        contactSet.size === contactArray.length &&
        contactArray.reduce((prev, cur) => prev && contactSet.has(cur), true)
    );
}

export class OutgoingGroupCreateOrUpdateTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;

    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _variant: 'create' | 'update',
        private readonly _createOrUpdate: GroupCreateOrUpdateFromLocal,
        private readonly _membersChanges: {
            readonly currentMembers: ReadonlySet<ContactModelStore>;
            readonly addedMembers: ReadonlySet<ContactModelStore>;
            readonly removedMembers: ReadonlySet<ContactModelStore>;
        },
        private readonly _groupId: GroupId,
        private readonly _precondition: () => boolean,
    ) {
        const groupString = groupDebugString(this._services.device.identity.string, this._groupId);
        this._log = this._services.logging.logger(
            `network.protocol.task.outgoing-group-${this._variant}.${groupString}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const messageIds = [
            randomMessageId(this._services.crypto),
            randomMessageId(this._services.crypto),
            randomMessageId(this._services.crypto),
            randomMessageId(this._services.crypto),
        ] as const;

        const groupModelStore = this._services.model.groups.getByGroupIdAndCreator(
            this._groupId,
            this._services.device.identity.string,
        );

        assert(groupModelStore !== undefined, 'The group must already exist');

        const transactionResult = await handle.transaction(
            TransactionScope.GROUP_SYNC,
            this._precondition,
            async () => {
                const group = groupModelStore.get();
                if (
                    this._createOrUpdate.name !== undefined &&
                    this._createOrUpdate.name !== group.view.name
                ) {
                    this._log.info('A group sync race occurred, the group names do not match');
                }
                if (
                    !equalContactSetAndArray(group.view.members, [
                        ...this._membersChanges.currentMembers,
                    ])
                ) {
                    this._log.info('A group sync race occurred, the members do not match');
                }
                const currentProfileiPicture = group.controller.profilePicture.get().view.picture;
                if (
                    (this._createOrUpdate.profilePictureChange?.type === 'removed' &&
                        currentProfileiPicture !== undefined) ||
                    (this._createOrUpdate.profilePictureChange?.type === 'set' &&
                        currentProfileiPicture !== undefined &&
                        !byteEquals(
                            this._createOrUpdate.profilePictureChange.pictureBytes,
                            currentProfileiPicture,
                        ))
                ) {
                    this._log.info(
                        'A group sync race occurred, the profile picture does not match',
                    );
                }

                let profilePicture: CspProfilePictureUpdate | undefined;
                switch (this._createOrUpdate.profilePictureChange?.type) {
                    case 'removed':
                    case undefined:
                        profilePicture = this._createOrUpdate.profilePictureChange;
                        break;
                    case 'set':
                        profilePicture = {
                            type: 'set',
                            blob: this._createOrUpdate.profilePictureChange.blob,
                            profilePictureSize:
                                this._createOrUpdate.profilePictureChange.pictureBytes.byteLength,
                            profilePictureBytes:
                                this._createOrUpdate.profilePictureChange.pictureBytes,
                        };
                        break;
                    default:
                        unreachable(this._createOrUpdate.profilePictureChange);
                }

                return await new ActiveGroupUpdateTask(
                    this._services,
                    groupModelStore,
                    messageIds,
                    {
                        addMembers: this._membersChanges.addedMembers,
                        removeMembers: this._membersChanges.removedMembers,
                        profilePicture,
                    },
                ).run(handle);
            },
        );

        if (!transactionCompleted(transactionResult[0])) {
            this._log.error('Could not finish transaction, precondition failed');
        }
    }
}
