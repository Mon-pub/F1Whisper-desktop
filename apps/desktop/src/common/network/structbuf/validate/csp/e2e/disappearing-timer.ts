/**
 * Decode + encode for the F1Whisper disappearing-messages timer control messages.
 *
 * Wire format (matching the F1Whisper Android fork; pure little-endian bytes, NOT a protobuf and NOT
 * a generated structbuf message):
 *
 * - 1:1 (CONTACT_DISAPPEARING_TIMER, 0x85): exactly 4 bytes = LE uint32 `timerSeconds` (0 = off).
 * - group (GROUP_DISAPPEARING_TIMER, 0x95): wrapped in a `GroupMemberContainer`
 *   (8B creator identity + 8B group id), whose `innerData` is the same 4-byte LE uint32 timer.
 *
 * No crypto/wasm is involved — type dispatch happens post-decrypt and the body is a plain integer.
 */

import type {LayerEncoder} from '~/common/network/protocol';
import {type ByteLengthEncoder, ensureU53, type ReadonlyUint8Array, type u53} from '~/common/types';

/** Number of bytes in a disappearing-timer body (a single LE uint32). */
export const DISAPPEARING_TIMER_BODY_BYTES = 4;

/**
 * A validated disappearing-timer body.
 */
export interface DisappearingTimer {
    /** Timer in seconds. `0` means disappearing messages are turned off. */
    readonly timerSeconds: u53;
}

/**
 * Decode a 4-byte little-endian uint32 disappearing-timer body.
 *
 * @throws if the body is not exactly {@link DISAPPEARING_TIMER_BODY_BYTES} bytes.
 */
export function decodeDisappearingTimer(body: ReadonlyUint8Array): DisappearingTimer {
    if (body.byteLength !== DISAPPEARING_TIMER_BODY_BYTES) {
        throw new Error(
            `Invalid disappearing-timer body length: expected ${DISAPPEARING_TIMER_BODY_BYTES}, got ${body.byteLength}`,
        );
    }
    const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
    return {timerSeconds: ensureU53(view.getUint32(0, true))};
}

/**
 * Compute the disappearing-messages expiry stamp for a message, given the per-conversation timer and
 * the moment the countdown starts (outbound: send time; inbound: first-read time). Returns
 * `undefined` if there is no active timer (the message does not disappear).
 */
export function computeDisappearingStamp(
    timerSeconds: u53 | undefined,
    start: Date,
): {disappearingTimerSeconds: u53; expireStartedAt: Date; expiresAt: Date} | undefined {
    if (timerSeconds === undefined || timerSeconds <= 0) {
        return undefined;
    }
    return {
        disappearingTimerSeconds: timerSeconds,
        expireStartedAt: start,
        expiresAt: new Date(start.getTime() + timerSeconds * 1000),
    };
}

/**
 * Build an encoder that writes a 4-byte little-endian uint32 disappearing-timer body. Used both for
 * the 1:1 body and (wrapped in a `GroupMemberContainer`) for the group body.
 */
export function encodeDisappearingTimer(timerSeconds: u53): LayerEncoder<ByteLengthEncoder> {
    return {
        byteLength: () => DISAPPEARING_TIMER_BODY_BYTES,
        encode: (array) => {
            const view = new DataView(array.buffer, array.byteOffset, array.byteLength);
            view.setUint32(0, timerSeconds, true);
            return array.subarray(0, DISAPPEARING_TIMER_BODY_BYTES);
        },
    } as LayerEncoder<ByteLengthEncoder>;
}
