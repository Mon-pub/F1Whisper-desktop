import type {DbContactUid} from '~/common/db';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Contact, Group} from '~/common/model';
import type {ModelStore} from '~/common/model/utils/model-store';
import {assert} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';

export interface IEditGroupViewModelCotnroller extends ProxyMarked {
    /**
     * Set the member list of this group.
     */
    readonly setMembers: (newMemberSet: ReadonlySet<DbContactUid>) => Promise<boolean>;
}

export class GroupEditViewModelController implements IEditGroupViewModelCotnroller {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    public constructor(
        private readonly _services: Pick<ServicesForViewModel, 'model'>,
        private readonly _group: Group,
    ) {}

    /** @inheritdoc */
    public async setMembers(newMemberSet: ReadonlySet<DbContactUid>): Promise<boolean> {
        const contactModelStoreSet: ModelStore<Contact>[] = [];
        for (const uid of newMemberSet.values()) {
            const contact = this._services.model.contacts.getByUid(uid);
            assert(contact !== undefined, 'Contact to be added to group must exist');
            contactModelStoreSet.push(contact);
        }
        const setMembersResult = await this._group.controller.setMembers.fromLocal(
            contactModelStoreSet,
            new Date(),
        );
        return setMembersResult !== 'failed';
    }
}
