/**
 * Decode + encode for the F1Whisper group-typing-indicator control message (CSP 0x84).
 *
 * Wire format (matching the F1Whisper Android fork; raw little-endian bytes, NOT a protobuf and NOT
 * wrapped in a group-member container):
 *
 *   8 bytes creator identity (US-ASCII) + 8 bytes group id (LE u64) + 1 byte typing flag
 *   (1 = typing, 0 = stopped) = 17 bytes total.
 *
 * Ephemeral (no server queue/ack), per-member 15s auto-expiry on the receiver. No crypto/wasm.
 */

import type {LayerEncoder} from '~/common/network/protocol';
import {
    ensureGroupId,
    ensureIdentityString,
    type GroupId,
    type IdentityString,
} from '~/common/network/types';
import type {ByteLengthEncoder, ReadonlyUint8Array} from '~/common/types';
import {UTF8} from '~/common/utils/codec';

/** Number of bytes in a group-typing body (8 creator + 8 group id + 1 flag). */
export const GROUP_TYPING_BODY_BYTES = 17;

/**
 * A validated group-typing body.
 */
export interface GroupTyping {
    readonly creatorIdentity: IdentityString;
    readonly groupId: GroupId;
    readonly isTyping: boolean;
}

/**
 * Decode a 17-byte group-typing body (8B creator identity + 8B LE group id + 1B typing flag).
 *
 * @throws if the body is not exactly {@link GROUP_TYPING_BODY_BYTES} bytes.
 */
export function decodeGroupTyping(body: ReadonlyUint8Array): GroupTyping {
    if (body.byteLength !== GROUP_TYPING_BODY_BYTES) {
        throw new Error(
            `Invalid group-typing body length: expected ${GROUP_TYPING_BODY_BYTES}, got ${body.byteLength}`,
        );
    }
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    const creatorIdentity = ensureIdentityString(UTF8.decode(body.subarray(0, 8) as Uint8Array));
    const groupId = ensureGroupId(view.getBigUint64(8, true));
    const isTyping = view.getUint8(16) !== 0;
    return {creatorIdentity, groupId, isTyping};
}

/**
 * Build an encoder that writes a 17-byte group-typing body.
 */
export function encodeGroupTyping(
    creatorIdentity: IdentityString,
    groupId: GroupId,
    isTyping: boolean,
): LayerEncoder<ByteLengthEncoder> {
    return {
        byteLength: () => GROUP_TYPING_BODY_BYTES,
        encode: (array) => {
            const view = new DataView(array.buffer, array.byteOffset, array.byteLength);
            // 8 bytes creator identity (US-ASCII; identity strings are exactly 8 chars).
            array.set(UTF8.encode(creatorIdentity).subarray(0, 8), 0);
            view.setBigUint64(8, groupId, true);
            view.setUint8(16, isTyping ? 1 : 0);
            return array.subarray(0, GROUP_TYPING_BODY_BYTES);
        },
    } as LayerEncoder<ByteLengthEncoder>;
}
