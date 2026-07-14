import type {CryptoBackend} from '~/common/crypto';
import {randomU32Uniform, randomU64} from '~/common/crypto/random';
import type {CallId, GroupId, MessageId, PollId} from '~/common/network/types';
import {tag} from '~/common/types';

import type {D2mMessage, D2mPayloadType} from '.';

/**
 * Decode a D2M payload and uplift it into another D2M payload via its payload
 * decoder.
 *
 * @param packet The D2M payload.
 * @param payloadDecoder The decoder that transforms the inner payload.
 * @returns an uplifted D2M payload.
 */
export function decode<P extends D2mMessage<D2mPayloadType, unknown>, OP>(
    packet: P,
    payloadDecoder: (payload: P['payload']) => OP,
): D2mMessage<P['type'], OP> {
    return {
        type: packet.type,
        payload: payloadDecoder(packet.payload),
    };
}

/**
 * Generate a random message ID.
 */
export function randomMessageId(crypto: Pick<CryptoBackend, 'randomBytes'>): MessageId {
    return tag<MessageId>(randomU64(crypto));
}

/**
 * Generate a random group ID.
 */
export function randomGroupId(crypto: Pick<CryptoBackend, 'randomBytes'>): GroupId {
    return tag<GroupId>(randomU64(crypto));
}

/**
 * Generate a random poll ID.
 */
export function randomPollId(crypto: Pick<CryptoBackend, 'randomBytes'>): PollId {
    return tag<PollId>(randomU64(crypto));
}

/**
 * Generate a random 1:1 call ID.
 *
 * Per the VoIP signaling contract, a call ID is a random 32 bit unsigned integer greater than 0
 * (the initiator generates it, the callee echoes it back on ringing/answer/ice/hangup).
 */
export function randomCallId(crypto: Pick<CryptoBackend, 'randomBytes'>): CallId {
    return tag<CallId>(randomU32Uniform(crypto, 0xffffffff) + 1);
}
