// @ts-nocheck
import type {Logger} from '~/common/logging';
import type {Integer as u53} from '@threema/ts-utils/integer/u53';

/**
 * A numeric enum whose utilities reference `u53`, but not `Logger`. The `Logger` import is
 * therefore dropped from the generated module, while the aliased `u53` binding is copied with its
 * alias.
 *
 * @generate convert
 */
export const enum CspPayloadType {
    ECHO_REQUEST = 0x00,
    ECHO_RESPONSE = 0x80,
}
