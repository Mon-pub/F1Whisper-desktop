import * as v from '@badrap/valita';

import {F1MessageMetadata} from '~/common/internal-protobuf/f1-message-metadata';
import {csp_e2e} from '~/common/network/protobuf/js';
import {validator} from '~/common/network/protobuf/utils';
import {MESSAGE_ID_SCHEMA} from '~/common/network/protobuf/validate/helpers';
import {clampF1DisappearingTimer} from '~/common/network/protocol/disappearing-message-metadata';
import {ensureU53, type ReadonlyUint8Array} from '~/common/types';
import {unixTimestampToDateMs} from '~/common/utils/number';
import {nullOptional, unsignedLongAsU64} from '~/common/utils/valita-helpers';

export const SCHEMA = validator(
    csp_e2e.MessageMetadata,
    v
        .object({
            padding: v.unknown(), // We don't care about the padding
            nickname: nullOptional(v.string()),
            messageId: MESSAGE_ID_SCHEMA,
            createdAt: unsignedLongAsU64().map(unixTimestampToDateMs),
        })
        .rest(v.unknown()),
);

const F1_SCHEMA = v
    .object({
        f1DisappearingTimer: nullOptional(v.number().map(ensureU53).map(clampF1DisappearingTimer)),
    })
    .rest(v.unknown());

export type Type = v.Infer<typeof SCHEMA> & v.Infer<typeof F1_SCHEMA>;

/** Decode the same protobuf bytes through the standard schema and the local field-100 overlay. */
export function decode(data: ReadonlyUint8Array): Type {
    return {
        ...SCHEMA.parse(csp_e2e.MessageMetadata.decode(data as Uint8Array)),
        ...F1_SCHEMA.parse(F1MessageMetadata.decode(data as Uint8Array)),
    };
}
