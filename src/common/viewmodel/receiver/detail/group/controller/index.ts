import type {DbContactReceiverLookup} from '~/common/db';
import {AcquaintanceLevel} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Group} from '~/common/model';
import type {DisbandGroupIntent} from '~/common/model/types/group';
import {assert} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';
import {updateReceiverData, type GroupReceiverUpdateData} from '~/common/viewmodel/utils/receiver';

export interface IGroupDetailViewModelController extends ProxyMarked {
    /**
     * Update the acquaintance level of the contact specified by `lookup`.
     */
    readonly setAcquaintanceLevelDirect: (lookup: DbContactReceiverLookup) => Promise<void>;

    /**
     * Update the group with the provided data.
     */
    readonly edit: (update: GroupReceiverUpdateData) => Promise<boolean>;

    /**
     * Remove a member from this group.
     */
    readonly removeMember: (lookup: DbContactReceiverLookup) => Promise<boolean>;

    /**
     * Disband this group.
     *
     * Returns true if the operation succeeded.
     */
    readonly disband: (intent: DisbandGroupIntent) => Promise<boolean>;
}

export class GroupDetailViewModelController implements IGroupDetailViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public constructor(
        private readonly _services: Pick<ServicesForViewModel, 'model'>,
        private readonly _group: Group,
    ) {}

    /** @inheritdoc */
    public async setAcquaintanceLevelDirect(lookup: DbContactReceiverLookup): Promise<void> {
        const contact = this._services.model.contacts.getByUid(lookup.uid);
        assert(contact !== undefined, 'A contact that is visible in the group details must exist');

        // Do nothing if the contact is a direct contact already.
        if (contact.get().view.acquaintanceLevel === AcquaintanceLevel.DIRECT) {
            return;
        }
        await contact.get().controller.update.fromLocal({
            acquaintanceLevel: AcquaintanceLevel.DIRECT,
        });
    }

    /** @inheritdoc */
    public async edit(update: GroupReceiverUpdateData): Promise<boolean> {
        return await updateReceiverData(this._group, update);
    }

    /** @inheritdoc */
    public async removeMember(lookup: DbContactReceiverLookup): Promise<boolean> {
        const newMemberSet = [...this._group.view.members].filter(
            (member) => member.ctx !== lookup.uid,
        );
        // We let the backend decide whether or not something has changed in the group membership
        // state.
        const memberUpdateResult = await this._group.controller.setMembers.fromLocal(
            newMemberSet,
            new Date(),
        );
        return memberUpdateResult !== 'failed';
    }

    /** @inheritdoc */
    public async disband(intent: DisbandGroupIntent): Promise<boolean> {
        return await this._services.model.groups.disband.fromLocal(this._group.ctx, intent);
    }
}
