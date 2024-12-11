import type {DbContactUid} from '~/common/db';
import {AcquaintanceLevel} from '~/common/enum';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
import type {ContactInit} from '~/common/model';
import {ModelStore} from '~/common/model/utils/model-store';
import {validContactsLookupSteps} from '~/common/network/protocol/task/common/contact-helper';
import type {IdentityString} from '~/common/network/types';
import {assert} from '~/common/utils/assert';
import {PROXY_HANDLER, type ProxyMarked} from '~/common/utils/endpoint';
import type {ServicesForViewModel} from '~/common/viewmodel';

export type ContactLookupResult =
    | {readonly type: 'me'}
    | {readonly type: 'invalid'}
    | {readonly type: 'exists-direct'}
    | {readonly type: 'exists-in-group'; readonly uid: DbContactUid}
    | {readonly type: 'new'; readonly contactInit: ContactInit};

export interface IReceiverListViewModelController extends ProxyMarked {
    /**
     * Lookup a contact using the `directory` backend and the `work` backend.
     *
     * Returns `invalid` if the identity belongs to an invalid entity, `me` if the identity is the
     * user, `exists-direct/group` if the contact exists in the database already depending on its
     * acquaintance level, or all necessary information to create the contact.
     */
    readonly lookupContact: (identityString: IdentityString) => Promise<ContactLookupResult>;

    /**
     * Update acquaintance level of a contact that exists.
     *
     * @throws if the contact does not exist.
     */
    readonly updateAcquaintanceLevelAndName: (
        uid: DbContactUid,
        nameUpdate: {readonly firstName: string; readonly lastName: string},
    ) => Promise<void>;

    /**
     * Create a contact.
     *
     * Returns the uid if the contact was successfully created, `race` if it has already been
     * created by a synced device before, i.e if there was a race.
     */
    readonly createContact: (contactInit: ContactInit) => Promise<DbContactUid | 'race'>;
}

export class ReceiverListViewModelController implements IReceiverListViewModelController {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;
    private readonly _log: Logger;

    public constructor(private readonly _services: ServicesForViewModel) {
        this._log = this._services.logging.logger('viewmodel.receiver.list');
    }

    /** @inheritdoc */
    public async lookupContact(identityString: IdentityString): Promise<ContactLookupResult> {
        const lookupStepsResult = await validContactsLookupSteps(
            this._services,
            new Set([identityString]),
            this._log,
        );
        const lookupResult = lookupStepsResult.get(identityString);
        assert(lookupResult !== undefined);

        if (lookupResult instanceof ModelStore) {
            return lookupResult.get().view.acquaintanceLevel === AcquaintanceLevel.DIRECT
                ? {type: 'exists-direct'}
                : {type: 'exists-in-group', uid: lookupResult.ctx};
        }
        if (lookupResult === 'invalid' || lookupResult === 'me') {
            return {type: lookupResult};
        }
        return {
            type: 'new',
            contactInit: {
                ...lookupResult,
                acquaintanceLevel: AcquaintanceLevel.DIRECT,
                nickname: undefined,
            },
        };
    }

    /** @inheritdoc */
    public async updateAcquaintanceLevelAndName(
        uid: DbContactUid,
        nameUpdate: {readonly firstName: string; readonly lastName: string},
    ): Promise<void> {
        const contactModelStore = this._services.model.contacts.getByUid(uid);
        assert(contactModelStore !== undefined, 'ContactModelStore must exist when updating it');
        await contactModelStore.get().controller.update.fromLocal({
            ...nameUpdate,
            acquaintanceLevel: AcquaintanceLevel.DIRECT,
        });
    }

    /** @inheritdoc */
    public async createContact(contactInit: ContactInit): Promise<DbContactUid | 'race'> {
        const {modelStore, existed} =
            await this._services.model.contacts.add.fromLocal(contactInit);
        return existed ? 'race' : modelStore.ctx;
    }
}
