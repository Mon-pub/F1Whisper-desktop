import * as v from '@badrap/valita';

import * as proto from '~/common/internal-protobuf/settings';
import type {SettingsCategoryCodec} from '~/common/settings';
import {instanceOf, nullEmptyStringOptional, nullOptional} from '~/common/utils/valita-helpers';

const WORK_SETTINGS_SCHEMA = v
    .object({
        logo: v.object({
            light: nullOptional(
                v.object({
                    url: v.string(),
                    blob: instanceOf<Uint8Array>(Uint8Array),
                }),
            ),
            dark: nullOptional(
                v.object({
                    url: v.string(),
                    blob: instanceOf<Uint8Array>(Uint8Array),
                }),
            ),
        }),
        orgName: nullEmptyStringOptional(v.string()),
        support: nullEmptyStringOptional(v.string()),
    })
    .rest(v.unknown());

/**
 * Validated work-sync settings.
 */
export type WorkSettings = v.Infer<typeof WORK_SETTINGS_SCHEMA>;

export const WORK_SETTINGS_CODEC: SettingsCategoryCodec<'work'> = {
    encode: (settings) =>
        proto.WorkSettings.encode({
            logo: {
                light: {
                    url: settings.logo.light?.url,
                    blob: settings.logo.light?.blob,
                },
                dark: {
                    url: settings.logo.dark?.url,
                    blob: settings.logo.dark?.blob,
                },
            },
            orgName: settings.orgName,
            support: settings.support,
        }).finish(),
    decode: (encoded) => WORK_SETTINGS_SCHEMA.parse(proto.WorkSettings.decode(encoded)),
} as const;
