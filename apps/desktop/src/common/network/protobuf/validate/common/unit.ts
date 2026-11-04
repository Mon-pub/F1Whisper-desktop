import * as v from '@badrap/valita';
import {common} from '@threema/protocol/protobuf';

import {validator} from '~/common/network/protobuf/utils';

/** Validates {@link common.Unit}. */
export const SCHEMA = validator(common.Unit, v.object({}));
export type Type = v.Infer<typeof SCHEMA>;
