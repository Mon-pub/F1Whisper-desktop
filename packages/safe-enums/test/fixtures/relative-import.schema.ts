// @ts-nocheck
import type {u53} from './../types';

/**
 * A numeric enum in a schema with a relative import specifier, which is rejected.
 *
 * @generate convert
 */
export const enum CspPayloadType {
    ECHO_REQUEST = 0x00,
    ECHO_RESPONSE = 0x80,
}
