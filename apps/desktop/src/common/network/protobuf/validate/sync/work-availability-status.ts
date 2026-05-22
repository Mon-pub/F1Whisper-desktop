import * as v from '@badrap/valita';

import {WorkAvailabilityStatusCategory, WorkAvailabilityStatusCategoryUtils} from '~/common/enum';
import {d2d_sync} from '~/common/network/protobuf/js';
import {validator} from '~/common/network/protobuf/utils';

/** Validates {@link d2d_sync.WorkAvailabilityStatus}. */
export const SCHEMA = validator(
    d2d_sync.WorkAvailabilityStatus,
    v
        .object({
            category: v
                .number()
                .map((value) => WorkAvailabilityStatusCategoryUtils.fromNumber(value)),
            description: v.string().map((value) => value.trim()),
        })
        .rest(v.unknown())
        // Per protocol, "No status" must not carry a description.
        .map((value) =>
            value.category === WorkAvailabilityStatusCategory.NONE
                ? {...value, description: ''}
                : value,
        ),
);
export type Type = v.Infer<typeof SCHEMA>;
