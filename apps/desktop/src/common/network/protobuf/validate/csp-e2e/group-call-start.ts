import * as v from '@badrap/valita';
import {csp_e2e} from '@threema/protocol/protobuf';
import {ensureU53} from '@threema/ts-utils/integer/u53';

import {wrapRawGroupCallKey} from '~/common/crypto/group-call';
import {validator} from '~/common/network/protobuf/utils';
import {ensureBaseUrl} from '~/common/network/types';
import {instanceOf} from '~/common/utils/valita-helpers';

export const SCHEMA = validator(
    csp_e2e.GroupCallStart,
    v
        .object({
            protocolVersion: v.number().map(ensureU53),
            gck: instanceOf(Uint8Array).map(wrapRawGroupCallKey),
            sfuBaseUrl: v.string().map((url) => ({raw: url, parsed: ensureBaseUrl(url, 'https:')})),
        })
        .rest(v.unknown()),
);

export type Type = Readonly<v.Infer<typeof SCHEMA>>;
