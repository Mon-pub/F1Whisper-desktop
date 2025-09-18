import * as v from '@badrap/valita';

import type {StatusMessageType} from '~/common/enum';
import * as protobuf from '~/common/internal-protobuf/status-message';
import {ensureIdentityString} from '~/common/network/types';
import type {StatusMessagesCodec} from '~/common/status';

const GROUP_MEMBERS_LEFT_SCHEMA = v
    .object({
        left: v.array(v.string().map(ensureIdentityString)),
    })
    .rest(v.unknown());

export const GROUP_MEMBERS_LEFT_CODEC: StatusMessagesCodec<StatusMessageType.GROUP_MEMBERS_LEFT> = {
    encode: (status) => protobuf.GroupMembersLeft.encode(status).finish(),
    decode: (encoded) =>
        GROUP_MEMBERS_LEFT_SCHEMA.parse(protobuf.GroupMembersLeft.decode(encoded as Uint8Array)),
} as const;
