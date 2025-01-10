import type {AppServicesForSvelte} from '~/app/types';
import type {DbContactUid} from '~/common/db';
import type {ContactInit} from '~/common/model/types/contact';
import type {IdentityString} from '~/common/network/types';
import type {ContactLookupResult} from '~/common/viewmodel/receiver/list/controller';

/**
 * Props accepted by the `ContactAddForm` component.
 */
export interface ContactAddFormProps {
    readonly services: Pick<AppServicesForSvelte, 'router'>;
    readonly actions: {
        readonly createContact: (contactInit: ContactInit) => Promise<DbContactUid | 'race'>;
        readonly lookupContact: (
            identityString: IdentityString,
        ) => Promise<ContactLookupResult | undefined>;
        readonly updateContactAcquaintanceLevelAndName: (
            uid: DbContactUid,
            nameUpdate: {readonly firstName: string; readonly lastName: string},
        ) => Promise<void>;
    };
}
