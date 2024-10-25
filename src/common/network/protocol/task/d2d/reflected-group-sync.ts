import {ReceiverType} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Contact, Group, GroupInit} from '~/common/model';
import {deactivateAndPurgeCacheCascade} from '~/common/model/conversation';
import type {ModelStore} from '~/common/model/utils/model-store';
import * as protobuf from '~/common/network/protobuf';
import type {TypeCreate} from '~/common/network/protobuf/validate/sync/group';
import {
    PASSIVE_TASK,
    type PassiveTask,
    type PassiveTaskCodecHandle,
    type PassiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {assert, unreachable} from '~/common/utils/assert';
import {idColorIndex} from '~/common/utils/id-color';
import {filterUndefinedProperties} from '~/common/utils/object';
import {mapValitaDefaultsToUndefined} from '~/common/utils/valita-helpers';

export class ReflectedGroupSyncTask implements PassiveTask<void> {
    public readonly type: PassiveTaskSymbol = PASSIVE_TASK;
    public readonly persist = false;
    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _message: protobuf.d2d.GroupSync,
        private readonly _reflectedAt: Date,
    ) {
        this._log = _services.logging.logger(`network.protocol.task.in-group-sync`);
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async run(handle: PassiveTaskCodecHandle): Promise<void> {
        const {model} = this._services;

        // Validate the Protobuf message
        let validatedMessage;
        try {
            validatedMessage = protobuf.validate.d2d.GroupSync.SCHEMA.parse(this._message);
        } catch (error) {
            this._log.error(
                `Discarding reflected GroupSync message due to validation error: ${error}`,
            );
            return;
        }
        this._log.info(`Received reflected group sync message (${validatedMessage.action})`);

        // Get existing group (if available)
        let groupIdentity;
        switch (validatedMessage.action) {
            case 'create': {
                this._createGroupFromGroupSyncCreate(handle, validatedMessage.create.group);
                return;
            }
            case 'delete':
                {
                    groupIdentity = validatedMessage.delete.groupIdentity;
                    const group = model.groups.getByGroupIdAndCreator(
                        groupIdentity.groupId,
                        groupIdentity.creatorIdentity,
                    );
                    if (group === undefined) {
                        this._log.error(
                            'Trying to delete a group that does not exist, discarding the message',
                        );
                        return;
                    }

                    const conversation = group.get().controller.conversation();
                    // If we get a group delete, the group is deleted from the database in any case
                    // so the user state does not matter.
                    this._services.model.groups.remove.fromSync(handle, group.ctx);
                    deactivateAndPurgeCacheCascade(
                        {type: ReceiverType.GROUP, uid: group.ctx},
                        conversation,
                    );
                }
                return;
            case 'update':
                {
                    groupIdentity = validatedMessage.update.group.groupIdentity;
                    const group = model.groups.getByGroupIdAndCreator(
                        groupIdentity.groupId,
                        groupIdentity.creatorIdentity,
                    );
                    if (group === undefined) {
                        this._log.error("Discarding 'update' message for unknown group");
                        return;
                    }
                    // TODO(DESK-1657): Make use of groupSync.update.memberStateChanges
                    this._updateGroupFromD2dSync(handle, group, validatedMessage.update.group);
                }
                break;
            default:
                unreachable(validatedMessage);
        }
    }

    private _createGroupFromGroupSyncCreate(
        handle: PassiveTaskCodecHandle,
        group: TypeCreate,
    ): void {
        const creator =
            group.groupIdentity.creatorIdentity === this._services.device.identity.string
                ? 'me'
                : this._services.model.contacts.getByIdentity(group.groupIdentity.creatorIdentity);

        assert(
            creator !== undefined,
            'The creator of a group reflected by GroupSync.Create must exist in the database',
        );

        const memberSet = new Set<ModelStore<Contact>>();
        const members = group.memberIdentities.identities;

        for (const member of members) {
            const memberModelStore = this._services.model.contacts.getByIdentity(member);
            assert(
                memberModelStore !== undefined,
                'Member specified in reflected groupSync.create must exist locally.',
            );
            memberSet.add(memberModelStore);
        }

        const overrideProperties = mapValitaDefaultsToUndefined(
            filterUndefinedProperties({
                notificationTriggerPolicyOverride: group.notificationTriggerPolicyOverride,
                notificationSoundPolicyOverride: group.notificationSoundPolicyOverride,
            }),
        );

        const init: GroupInit = {
            category: group.conversationCategory,
            createdAt: group.createdAt,
            colorIndex: idColorIndex({type: ReceiverType.GROUP, ...group.groupIdentity}),
            creator,
            groupId: group.groupIdentity.groupId,
            name: group.name,
            userState: group.userState,
            visibility: group.conversationVisibility,
            lastUpdate: this._reflectedAt,
            notificationSoundPolicyOverride: overrideProperties.notificationSoundPolicyOverride,
            notificationTriggerPolicyOverride: overrideProperties.notificationTriggerPolicyOverride,
        };

        this._services.model.groups.add.fromSync(handle, init, [...memberSet]);
    }

    /**
     * Update a group from D2D sync.
     */
    private _updateGroupFromD2dSync(
        handle: PassiveTaskCodecHandle,
        group: ModelStore<Group>,
        update: protobuf.validate.sync.Group.TypeUpdate,
    ): void {
        const controller = group.get().controller;

        const propertiesToUpdate = mapValitaDefaultsToUndefined(
            filterUndefinedProperties({
                notificationTriggerPolicyOverride: update.notificationTriggerPolicyOverride,
                notificationSoundPolicyOverride: update.notificationSoundPolicyOverride,
                name: update.name,
                userState: update.userState,
            }),
        );

        // TODO(DESK-1657): Make use of groupSync.update.memberStateChanges
        const members = update.memberIdentities?.identities;

        // Only update members if specified by the update message
        if (members !== undefined) {
            const memberUpdates: ModelStore<Contact>[] = [];
            for (const member of members) {
                const memberModelStore = this._services.model.contacts.getByIdentity(member);
                assert(
                    memberModelStore !== undefined,
                    'Member specified in reflected groupSync.update must exist locally.',
                );
                memberUpdates.push(memberModelStore);
            }

            controller.setMembers.fromSync(handle, memberUpdates, this._reflectedAt);
        }

        controller.update.fromSync(handle, propertiesToUpdate, this._reflectedAt);

        if (update.conversationCategory !== undefined) {
            controller.conversation().get().controller.update.fromSync(handle, {
                category: update.conversationCategory,
            });
        }
        if (update.conversationVisibility !== undefined) {
            controller.conversation().get().controller.update.fromSync(handle, {
                visibility: update.conversationVisibility,
            });
        }
    }
}
