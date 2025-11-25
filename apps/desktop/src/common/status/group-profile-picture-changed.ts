import * as v from '@badrap/valita';

import type {StatusMessageType} from '~/common/enum';
import * as protobuf from '~/common/internal-protobuf/status-message';
import type {StatusMessagesCodec} from '~/common/status';
import {unreachable} from '~/common/utils/assert';

const GROUP_PROFILE_PICTURE_CHANGED = v
    .object({
        change: v.number().chain((change) => {
            const castedChange = change as protobuf.ProfilePictureChange;
            switch (castedChange) {
                case protobuf.ProfilePictureChange.SET:
                case protobuf.ProfilePictureChange.REMOVED:
                case protobuf.ProfilePictureChange.UNRECOGNIZED:
                    return v.ok(castedChange);
                default:
                    return v.err(unreachable(castedChange));
            }
        }),
    })
    .rest(v.unknown());

export const GROUP_PROFILE_PICTURE_CHANGED_CODEC: StatusMessagesCodec<StatusMessageType.GROUP_PROFILE_PICTURE_CHANGED> =
    {
        encode: (status) => protobuf.GroupProfilePictureChanged.encode(status).finish(),
        decode: (encoded) =>
            GROUP_PROFILE_PICTURE_CHANGED.parse(
                protobuf.GroupProfilePictureChanged.decode(encoded as Uint8Array),
            ),
    } as const;
