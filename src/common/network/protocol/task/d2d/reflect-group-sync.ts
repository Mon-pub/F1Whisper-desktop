import {GroupUserState, type TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import {groupDebugString} from '~/common/model/group';
import type {ConversationUpdateFromToSync} from '~/common/model/types/conversation';
import type {GroupUpdate} from '~/common/model/types/group';
import {D2mMessageFlags} from '~/common/network/protocol/flags';
import type {
    ActiveTaskCodecHandle,
    ComposableTask,
    ServicesForTasks,
    TransactionRunning,
} from '~/common/network/protocol/task';
import {
    getD2dGroupSyncCreate,
    getD2dGroupSyncUpdate,
} from '~/common/network/protocol/task/d2d/group-sync-helper';
import type {GroupId, IdentityString} from '~/common/network/types';
import type {ReadonlyUint8Array} from '~/common/types';
import {assert, unreachable} from '~/common/utils/assert';

interface GroupSyncUpdate {
    readonly type: 'update';
    readonly creatorIdentity: IdentityString;
    readonly groupId: GroupId;
    readonly group: Pick<
        GroupUpdate,
        'notificationSoundPolicyOverride' | 'notificationTriggerPolicyOverride'
    >;
    readonly conversation: ConversationUpdateFromToSync;
}

interface GroupSyncCreate {
    readonly type: 'create';
    readonly creatorIdentity: IdentityString;
    readonly groupId: GroupId;
    readonly name: string | undefined;
    readonly profilePicture: ReadonlyUint8Array | undefined;
    readonly memberIdentities: ReadonlySet<IdentityString>;
}

export type GroupSyncVariant = GroupSyncCreate | GroupSyncUpdate;

/**
 * Reflect group update to other devices in the device group.
 *
 * This task can only be called when a transaction is already running.
 */
export class ReflectGroupSyncTask
    implements ComposableTask<ActiveTaskCodecHandle<'volatile'>, void>
{
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        transaction: TransactionRunning<TransactionScope.GROUP_SYNC>, // Ensures transaction is running
        private readonly _variant: GroupSyncVariant,
    ) {
        const groupString = groupDebugString(_variant.creatorIdentity, _variant.groupId);
        this._log = this._services.logging.logger(
            `network.protocol.task.reflect-group-sync.${groupString}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'volatile'>): Promise<void> {
        const variant = this._variant;

        // Determine group sync message and send it
        let groupSync;

        switch (variant.type) {
            case 'create':
                groupSync = getD2dGroupSyncCreate(
                    {
                        creatorIdentity: variant.creatorIdentity,
                        groupId: variant.groupId,
                    },
                    new Date(),
                    [...variant.memberIdentities],
                    variant.name ?? '',
                    GroupUserState.MEMBER,
                );
                break;
            case 'update': {
                const group = this._services.model.groups.getByGroupIdAndCreator(
                    this._variant.groupId,
                    this._variant.creatorIdentity,
                );
                assert(group !== undefined, 'Group must exist when updating it');
                groupSync = getD2dGroupSyncUpdate(
                    {
                        creatorIdentity: variant.creatorIdentity,
                        groupId: variant.groupId,
                    },
                    undefined,
                    undefined,
                    undefined,
                    {
                        view: group.get().controller.conversation().get().view,
                        update: variant.conversation,
                    },
                );
                break;
            }
            default:
                unreachable(variant);
        }
        this._log.info(`Syncing group '${variant.type}' to other devices`);
        await handle.reflect([{envelope: {groupSync}, flags: D2mMessageFlags.none()}]);
    }
}
