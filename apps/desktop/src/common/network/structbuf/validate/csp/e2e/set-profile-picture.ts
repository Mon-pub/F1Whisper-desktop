import * as v from '@badrap/valita';
import * as csp from '@threema/protocol/structbuf/csp';
import {ensureU53} from '@threema/ts-utils/integer/u53';

import {ensureBlobId} from '~/common/network/protocol/blob';
import {validator} from '~/common/network/structbuf/validate/utils';
import {wrapRawBlobKey} from '~/common/network/types/keys';
import {instanceOf} from '~/common/utils/valita-helpers';

/** Validates {@link csp.e2e.SetProfilePicture} */
export const SCHEMA = v
    .object(
        validator(csp.e2e.SetProfilePicture.prototype, {
            pictureBlobId: instanceOf(Uint8Array).map(ensureBlobId),
            pictureSize: v.number().map(ensureU53),
            key: instanceOf(Uint8Array).map(wrapRawBlobKey),
        }),
    )
    .rest(v.unknown());

/** Validated Scheme for {@link csp.e2e.SetProfilePicture} */
export type Type = v.Infer<typeof SCHEMA>;
