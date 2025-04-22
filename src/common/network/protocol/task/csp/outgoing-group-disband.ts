import {CspE2eGroupControlType, GroupUserState, TransactionScope} from '~/common/enum';
import type {Logger} from '~/common/logging';
import type {Group} from '~/common/model';
import {groupDebugString} from '~/common/model/group';
import {CspMessageFlags} from '~/common/network/protocol/flags';
import {
    ACTIVE_TASK,
    type ActiveTask,
    type ActiveTaskCodecHandle,
    type ActiveTaskSymbol,
    type ServicesForTasks,
} from '~/common/network/protocol/task';
import {OutgoingCspMessagesTask} from '~/common/network/protocol/task/csp/outgoing-csp-messages';
import {transactionCompleted} from '~/common/network/protocol/task/manager';
import {randomMessageId} from '~/common/network/protocol/utils';
import * as structbuf from '~/common/network/structbuf';

export class OutgoingGroupDisbandTask implements ActiveTask<void, 'persistent'> {
    public readonly type: ActiveTaskSymbol = ACTIVE_TASK;
    public readonly persist = true;
    public readonly transaction = undefined;

    private readonly _log: Logger;

    public constructor(
        private readonly _services: ServicesForTasks,
        private readonly _group: Group,
    ) {
        const groupString = groupDebugString(
            this._services.device.identity.string,
            this._group.view.groupId,
        );
        this._log = this._services.logging.logger(
            `network.protocol.task.outgoing-group-disband-task.${groupString}`,
        );
    }

    public async run(handle: ActiveTaskCodecHandle<'persistent'>): Promise<void> {
        const messageId = randomMessageId(this._services.crypto);

        const transactionResult = await handle.transaction(
            TransactionScope.GROUP_SYNC,
            // Precondition: If the group exists and is not marked as left, log an error that a
            // major group state inconsistency has been detected and abort these steps.
            () => {
                const group = this._services.model.groups.getByGroupIdAndCreator(
                    this._group.view.groupId,
                    this._services.device.identity.string,
                );
                return group === undefined || group.get().view.userState !== GroupUserState.MEMBER;
            },
            async () => {
                await new OutgoingCspMessagesTask(this._services, [
                    {
                        receiver: {main: this._group},
                        sharedMessageProperties: {
                            allowUserProfileDistribution: true,
                            createdAt: new Date(),
                            messageId,
                            overrideReflectedProperty: false,
                        },
                        specifics: {
                            default: {
                                encoder: structbuf.bridge.encoder(
                                    structbuf.csp.e2e.GroupCreatorContainer,
                                    {
                                        groupId: this._group.view.groupId,
                                        innerData: structbuf.bridge.encoder(
                                            structbuf.csp.e2e.GroupSetup,
                                            {members: []},
                                        ),
                                    },
                                ),
                                messageProperties: {
                                    type: CspE2eGroupControlType.GROUP_SETUP,

                                    cspMessageFlags: CspMessageFlags.none(),
                                },
                            },
                        },
                    },
                ]).run(handle);
            },
        );

        if (!transactionCompleted(transactionResult[0])) {
            this._log.error(
                'Could not finish transaction, a major group inconsistency has been detected.',
            );
        }
    }
}
