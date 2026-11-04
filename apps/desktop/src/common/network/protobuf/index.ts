// Re-export Protobuf messages
export * from '@threema/protocol/protobuf';
import {common} from '@threema/protocol/protobuf';

import * as utils from './utils';
import * as validate from './validate';

export {utils, validate};

/**
 * Unit message instance.
 */
export const UNIT_MESSAGE = utils.creator(common.Unit, {});
