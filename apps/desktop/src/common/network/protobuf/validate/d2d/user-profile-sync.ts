import * as v from '@badrap/valita';

import {d2d, d2d_sync} from '~/common/network/protobuf/js';
import {validator} from '~/common/network/protobuf/utils';
import {DeltaImage, Identities, Unit} from '~/common/network/protobuf/validate/common';
import {NULL_OR_UNDEFINED_SCHEMA} from '~/common/network/protobuf/validate/helpers';
import {ensureNickname} from '~/common/network/types';
import {mappedOptional, nullOptional} from '~/common/utils/valita-helpers';

/** Base schema for a {@link d2d.UserProfileSync.ProfilePictureShareWith} oneof instance */
const BASE_SCHEMA_FOR_PROFILE_PICTURE_SHARE_WITH = {
    nobody: NULL_OR_UNDEFINED_SCHEMA,
    everyone: NULL_OR_UNDEFINED_SCHEMA,
    allowList: NULL_OR_UNDEFINED_SCHEMA,
};

const SCHEMA_PROFILE_PICTURE_SHARE_WITH_NOBODY = validator(
    d2d_sync.UserProfile.ProfilePictureShareWith,
    v
        .object({
            ...BASE_SCHEMA_FOR_PROFILE_PICTURE_SHARE_WITH,
            policy: v.literal('nobody'),
            nobody: Unit.SCHEMA,
        })
        .rest(v.unknown()),
);

const SCHEMA_PROFILE_PICTURE_SHARE_WITH_EVERYONE = validator(
    d2d_sync.UserProfile.ProfilePictureShareWith,
    v
        .object({
            ...BASE_SCHEMA_FOR_PROFILE_PICTURE_SHARE_WITH,
            policy: v.literal('everyone'),
            everyone: Unit.SCHEMA,
        })
        .rest(v.unknown()),
);

const SCHEMA_PROFILE_PICTURE_SHARE_WITH_ALLOW_LIST = validator(
    d2d_sync.UserProfile.ProfilePictureShareWith,
    v
        .object({
            ...BASE_SCHEMA_FOR_PROFILE_PICTURE_SHARE_WITH,
            policy: v.literal('allowList'),
            allowList: Identities.SCHEMA,
        })
        .rest(v.unknown()),
);

/** Base schema for an {@link d2d_sync.UserProfile.IdentityLinks.IdentityLink} oneof instance */
const BASE_SCHEMA_FOR_IDENTITY_LINK = {
    description: v.string().optional(() => ''),
    phoneNumber: NULL_OR_UNDEFINED_SCHEMA,
    email: NULL_OR_UNDEFINED_SCHEMA,
};

const SCHEMA_FOR_IDENTITY_LINK_PHONE_NUMBER = validator(
    d2d_sync.UserProfile.IdentityLinks.IdentityLink,
    v
        .object({
            ...BASE_SCHEMA_FOR_IDENTITY_LINK,
            type: v.literal('phoneNumber'),
            phoneNumber: v.string(),
        })
        .rest(v.unknown()),
);

const SCHEMA_FOR_IDENTITY_LINK_EMAIL = validator(
    d2d_sync.UserProfile.IdentityLinks.IdentityLink,
    v
        .object({
            ...BASE_SCHEMA_FOR_IDENTITY_LINK,
            type: v.literal('email'),
            email: v.string(),
        })
        .rest(v.unknown()),
);

const SCHEMA_IDENTITY_LINK = validator(
    d2d_sync.UserProfile.IdentityLinks.IdentityLink,
    v.union(SCHEMA_FOR_IDENTITY_LINK_PHONE_NUMBER, SCHEMA_FOR_IDENTITY_LINK_EMAIL),
);

const SCHEMA_IDENTITY_LINKS = validator(
    d2d_sync.UserProfile.IdentityLinks,
    v
        .object({
            links: v.array(SCHEMA_IDENTITY_LINK),
        })
        .rest(v.unknown()),
);

const SCHEMA_USER_PROFILE = validator(
    d2d_sync.UserProfile,
    v
        .object({
            nickname: mappedOptional(v.string().map(ensureNickname)),
            profilePicture: nullOptional(DeltaImage.SCHEMA),
            profilePictureShareWith: nullOptional(
                validator(
                    d2d_sync.UserProfile.ProfilePictureShareWith,
                    v.union(
                        SCHEMA_PROFILE_PICTURE_SHARE_WITH_NOBODY,
                        SCHEMA_PROFILE_PICTURE_SHARE_WITH_EVERYONE,
                        SCHEMA_PROFILE_PICTURE_SHARE_WITH_ALLOW_LIST,
                    ),
                ),
            ),
            identityLinks: nullOptional(SCHEMA_IDENTITY_LINKS),
        })
        .rest(v.unknown()),
);

export const SCHEMA = validator(
    d2d.UserProfileSync,
    v
        .object({
            action: v.literal('update'),
            update: validator(
                d2d.UserProfileSync.Update,
                v
                    .object({
                        userProfile: SCHEMA_USER_PROFILE,
                    })
                    .rest(v.unknown()),
            ),
        })
        .rest(v.unknown()),
);
export type Type = v.Infer<typeof SCHEMA>;
