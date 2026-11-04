import * as v from '@badrap/valita';
import * as csp from '@threema/protocol/structbuf/csp';
import {UTF8} from '@threema/ts-utils/codec/utf8';

import {validator} from '~/common/network/structbuf/validate/utils';
import {instanceOf} from '~/common/utils/valita-helpers';

/** Validates {@link csp.e2e.Text} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.Text.prototype, {
            text: instanceOf<Uint8Array>(Uint8Array).map((value) => UTF8.decode(value)),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.Text} */
export type Type = v.Infer<typeof SCHEMA>;
