import * as v from '@badrap/valita';
import * as csp from '@threema/protocol/structbuf/csp';
import {UTF8} from '@threema/ts-utils/codec/utf8';

import {validator} from '~/common/network/structbuf/validate/utils';
import {ensureGroupId, ensureIdentityString} from '~/common/network/types';
import {instanceOf} from '~/common/utils/valita-helpers';

/** Validates {@link csp.e2e.GroupMemberContainer} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.GroupMemberContainer.prototype, {
            creatorIdentity: instanceOf<Uint8Array>(Uint8Array)
                .map((value) => UTF8.decode(value))
                .map(ensureIdentityString),
            groupId: v.bigint().map(ensureGroupId),
            innerData: instanceOf<Uint8Array>(Uint8Array),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.GroupMemberContainer} */
export type Type = v.Infer<typeof SCHEMA>;
