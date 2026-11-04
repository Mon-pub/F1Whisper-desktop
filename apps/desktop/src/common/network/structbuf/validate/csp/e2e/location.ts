import * as v from '@badrap/valita';
import * as csp from '@threema/protocol/structbuf/csp';
import {UTF8} from '@threema/ts-utils/codec/utf8';

import {parseLocation} from '~/common/network/protocol/task/common/location';
import {validator} from '~/common/network/structbuf/validate/utils';
import {instanceOf} from '~/common/utils/valita-helpers';

/** Validates {@link csp.e2e.Location} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.Location.prototype, {
            location: instanceOf<Uint8Array>(Uint8Array)
                .map((value) => UTF8.decode(value))
                .map(parseLocation),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.Location} */
export type Type = v.Infer<typeof SCHEMA>;
