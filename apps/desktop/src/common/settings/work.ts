import * as v from '@badrap/valita';

import * as proto from '~/common/internal-protobuf/settings';
import {MDM_VALUE_SCHEMA} from '~/common/mdm';
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
        threemaMdmParameters: v
            .record(v.object({value: MDM_VALUE_SCHEMA}))
            .optional()
            .default({}),
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
                light: settings.logo.light,
                dark: settings.logo.dark,
            },
            orgName: settings.orgName,
            support: settings.support,
            threemaMdmParameters: settings.threemaMdmParameters,
        }).finish(),
    decode: (encoded) => WORK_SETTINGS_SCHEMA.parse(proto.WorkSettings.decode(encoded)),
} as const;
