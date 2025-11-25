import * as v from '@badrap/valita';

import {csp_e2e} from '~/common/network/protobuf';
import {validator} from '~/common/network/protobuf/utils';
import {
    MESSAGE_ID_SCHEMA,
    NULL_OR_UNDEFINED_SCHEMA,
} from '~/common/network/protobuf/validate/helpers';
import {ensureEmojiReaction} from '~/common/network/types';
import type {ReadonlyUint8Array} from '~/common/types';
import {UTF8} from '~/common/utils/codec';
import {instanceOf} from '~/common/utils/valita-helpers';

/** Base schema for an {@link csp.reaction} oneof instance */
const BASE_SCHEMA = {
    apply: NULL_OR_UNDEFINED_SCHEMA,
    withdraw: NULL_OR_UNDEFINED_SCHEMA,
    messageId: MESSAGE_ID_SCHEMA,
};

const SCHEMA_APPLY = v
    .object({
        ...BASE_SCHEMA,
        action: v.literal('apply'),
        apply: instanceOf<ReadonlyUint8Array>(Uint8Array).map((value) =>
            ensureEmojiReaction(UTF8.decode(value)),
        ),
    })
    .rest(v.unknown());

const SCHEMA_WITHDRAW = v
    .object({
        ...BASE_SCHEMA,
        action: v.literal('withdraw'),
        withdraw: instanceOf<ReadonlyUint8Array>(Uint8Array).map((value) =>
            ensureEmojiReaction(UTF8.decode(value)),
        ),
    })
    .rest(v.unknown());

/** Validates {@link csp_e2e.Reaction} */

export const SCHEMA = validator(csp_e2e.Reaction, v.union(SCHEMA_APPLY, SCHEMA_WITHDRAW));

/** Validated Scheme for {@link csp_e2e.Reaction} */
export type Type = v.Infer<typeof SCHEMA>;
