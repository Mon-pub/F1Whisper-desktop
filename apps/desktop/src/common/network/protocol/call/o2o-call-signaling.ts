/**
 * VoIP signaling codec for 1:1 (o2o) calls.
 *
 * All 5 signaling message types (`call-offer`, `call-answer`, `call-ice-candidate`,
 * `call-hangup`, `call-ringing`) carry a single UTF-8, JSON-encoded blob in their respective
 * structbuf field. This module defines the payload shapes (bit-for-bit compatible with the
 * Android/iOS clients) and the encode/decode functions between the validated payload objects and
 * the raw `Uint8Array` blob that goes into (or comes out of) the structbuf `Call*` classes'
 * `offer` / `answer` / `candidates` / `hangup` field (the latter is reused verbatim for
 * `call-ringing`, see {@link structbuf.csp.e2e.CallRingingLike}).
 */
import * as v from '@badrap/valita';

import {O2oCallAnswerAction, O2oCallRejectReason, O2oCallRejectReasonUtils} from '~/common/enum';
import type {CallId} from '~/common/network/types';
import {ensureCallId} from '~/common/network/types';
import {ensureU32, type u32} from '~/common/types';
import {UTF8} from '~/common/utils/codec';

/**
 * WebRTC offer object (`call-offer`'s `offer` field).
 */
export interface CallOfferPayloadOffer {
    readonly sdpType: 'offer';
    readonly sdp: string;
}

/**
 * WebRTC answer object (`call-answer`'s `answer` field, only present when accepting).
 */
export interface CallAnswerPayloadAnswer {
    readonly sdpType: 'answer' | 'pranswer';
    readonly sdp: string;
}

/**
 * A single WebRTC ICE candidate (one entry of `call-ice-candidate`'s `candidates` field).
 */
export interface CallIceCandidatePayloadCandidate {
    readonly candidate: string;
    readonly sdpMid: string | null;
    readonly sdpMLineIndex: u32 | null;
    readonly ufrag: string | null;
}

/**
 * Validated `call-offer` (`0x60`) payload.
 *
 * Note: `features` is intentionally omitted for audio-only calls (v1 has no video/feature
 * negotiation), so it is not part of this payload type.
 */
export interface CallOfferPayload {
    readonly callId: CallId;
    readonly offer: CallOfferPayloadOffer;
}

/**
 * Validated `call-answer` (`0x61`) payload: either an accept (carrying an answer) or a reject
 * (carrying a reason).
 */
export type CallAnswerPayload =
    | {
          readonly callId: CallId;
          readonly action: typeof O2oCallAnswerAction.ACCEPT;
          readonly answer: CallAnswerPayloadAnswer;
      }
    | {
          readonly callId: CallId;
          readonly action: typeof O2oCallAnswerAction.REJECT;
          readonly rejectReason: O2oCallRejectReason;
      };

/**
 * Validated `call-ice-candidate` (`0x62`) payload.
 */
export interface CallIceCandidatePayload {
    readonly callId: CallId;
    readonly removed: false;
    readonly candidates: readonly CallIceCandidatePayloadCandidate[];
}

/**
 * Validated `call-hangup` (`0x63`) payload.
 */
export interface CallHangupPayload {
    readonly callId: CallId;
}

/**
 * Validated `call-ringing` (`0x64`) payload.
 */
export interface CallRingingPayload {
    readonly callId: CallId;
}

// The `callId` field is optional on the wire ("assume 0 if not set"), see {@link ensureCallId}
// which is deliberately tolerant of 0 on decode even though a freshly generated call ID must be
// non-zero (see {@link randomCallId} in `~/common/network/protocol/utils`).
const CALL_ID_SCHEMA = v
    .number()
    .map(ensureU32)
    .optional(() => 0)
    .map(ensureCallId);

const OFFER_SCHEMA = v
    .object({
        sdpType: v.literal('offer'),
        sdp: v.string(),
    })
    .rest(v.unknown());

const ANSWER_SCHEMA = v
    .object({
        sdpType: v.union(v.literal('answer'), v.literal('pranswer')),
        sdp: v.string(),
    })
    .rest(v.unknown());

const REJECT_REASON_SCHEMA = v
    .number()
    .map((value) => O2oCallRejectReasonUtils.fromNumber(value, O2oCallRejectReason.UNKNOWN));

const CANDIDATE_SCHEMA = v
    .object({
        candidate: v.string(),
        sdpMid: v.string().nullable().optional(() => null),
        sdpMLineIndex: v.number().map(ensureU32).nullable().optional(() => null),
        ufrag: v.string().nullable().optional(() => null),
    })
    .rest(v.unknown());

/**
 * Validates the JSON payload of a `call-offer` (`0x60`) message.
 */
export const CALL_OFFER_SCHEMA = v
    .object({
        callId: CALL_ID_SCHEMA,
        offer: OFFER_SCHEMA,
    })
    .rest(v.unknown());

/**
 * Validates the JSON payload of a `call-answer` (`0x61`) message.
 */
export const CALL_ANSWER_SCHEMA = v
    .union(
        v
            .object({
                callId: CALL_ID_SCHEMA,
                action: v.literal(O2oCallAnswerAction.ACCEPT),
                answer: ANSWER_SCHEMA,
            })
            .rest(v.unknown()),
        v
            .object({
                callId: CALL_ID_SCHEMA,
                action: v.literal(O2oCallAnswerAction.REJECT),
                rejectReason: REJECT_REASON_SCHEMA,
            })
            .rest(v.unknown()),
    )
    .map((value): CallAnswerPayload => {
        if (value.action === O2oCallAnswerAction.ACCEPT) {
            return {callId: value.callId, action: O2oCallAnswerAction.ACCEPT, answer: value.answer};
        }
        return {
            callId: value.callId,
            action: O2oCallAnswerAction.REJECT,
            rejectReason: value.rejectReason,
        };
    });

/**
 * Validates the JSON payload of a `call-ice-candidate` (`0x62`) message.
 */
export const CALL_ICE_CANDIDATE_SCHEMA = v
    .object({
        callId: CALL_ID_SCHEMA,
        removed: v.literal(false).optional(() => false),
        candidates: v.array(CANDIDATE_SCHEMA).assert(
            (candidates) => candidates.length > 0,
            'candidates must not be empty',
        ),
    })
    .rest(v.unknown());

/**
 * Validates the JSON payload of a `call-hangup` (`0x63`) message. An empty object (or empty
 * bytes, see {@link decodeCallHangup}) is legal (historically, hangup messages may be empty).
 */
export const CALL_HANGUP_SCHEMA = v
    .object({
        callId: CALL_ID_SCHEMA,
    })
    .rest(v.unknown());

/**
 * Validates the JSON payload of a `call-ringing` (`0x64`) message. An empty object (or empty
 * bytes, see {@link decodeCallRinging}) is legal.
 */
export const CALL_RINGING_SCHEMA = v
    .object({
        callId: CALL_ID_SCHEMA,
    })
    .rest(v.unknown());

/**
 * Parse a structbuf `Call*` blob as UTF-8 JSON, treating empty bytes as an empty object (mirrors
 * the Android/iOS tolerant decode for `call-hangup` / `call-ringing`).
 */
function parseJsonBlob(bytes: Uint8Array): unknown {
    if (bytes.byteLength === 0) {
        return {};
    }
    return JSON.parse(UTF8.decode(bytes));
}

/**
 * Encode a JSON-serializable payload object into the UTF-8 `Uint8Array` blob expected by the
 * corresponding structbuf `Call*` field.
 */
function encodeJsonBlob(payload: Record<string, unknown>): Uint8Array {
    return UTF8.encode(JSON.stringify(payload));
}

/**
 * Encode a {@link CallOfferPayload} into the blob for {@link structbuf.csp.e2e.CallOfferLike.offer}.
 */
export function encodeCallOffer(payload: CallOfferPayload): Uint8Array {
    return encodeJsonBlob({
        callId: payload.callId,
        offer: {sdpType: payload.offer.sdpType, sdp: payload.offer.sdp},
    });
}

/**
 * Decode the blob of {@link structbuf.csp.e2e.CallOfferLike.offer} into a validated
 * {@link CallOfferPayload}.
 */
export function decodeCallOffer(bytes: Uint8Array): CallOfferPayload {
    return CALL_OFFER_SCHEMA.parse(parseJsonBlob(bytes));
}

/**
 * Encode a {@link CallAnswerPayload} into the blob for
 * {@link structbuf.csp.e2e.CallAnswerLike.answer}.
 */
export function encodeCallAnswer(payload: CallAnswerPayload): Uint8Array {
    if (payload.action === O2oCallAnswerAction.ACCEPT) {
        return encodeJsonBlob({
            callId: payload.callId,
            action: O2oCallAnswerAction.ACCEPT,
            answer: {sdpType: payload.answer.sdpType, sdp: payload.answer.sdp},
        });
    }
    return encodeJsonBlob({
        callId: payload.callId,
        action: O2oCallAnswerAction.REJECT,
        rejectReason: payload.rejectReason,
    });
}

/**
 * Decode the blob of {@link structbuf.csp.e2e.CallAnswerLike.answer} into a validated
 * {@link CallAnswerPayload}.
 */
export function decodeCallAnswer(bytes: Uint8Array): CallAnswerPayload {
    return CALL_ANSWER_SCHEMA.parse(parseJsonBlob(bytes));
}

/**
 * Encode a {@link CallIceCandidatePayload} into the blob for
 * {@link structbuf.csp.e2e.CallIceCandidateLike.candidates}.
 */
export function encodeCallIceCandidate(payload: CallIceCandidatePayload): Uint8Array {
    return encodeJsonBlob({
        callId: payload.callId,
        removed: false,
        candidates: payload.candidates.map((candidate) => ({
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            ufrag: candidate.ufrag,
        })),
    });
}

/**
 * Decode the blob of {@link structbuf.csp.e2e.CallIceCandidateLike.candidates} into a validated
 * {@link CallIceCandidatePayload}.
 */
export function decodeCallIceCandidate(bytes: Uint8Array): CallIceCandidatePayload {
    return CALL_ICE_CANDIDATE_SCHEMA.parse(parseJsonBlob(bytes));
}

/**
 * Encode a {@link CallHangupPayload} into the blob for
 * {@link structbuf.csp.e2e.CallHangupLike.hangup}.
 */
export function encodeCallHangup(payload: CallHangupPayload): Uint8Array {
    return encodeJsonBlob({callId: payload.callId});
}

/**
 * Decode the blob of {@link structbuf.csp.e2e.CallHangupLike.hangup} into a validated
 * {@link CallHangupPayload}. Empty bytes decode to `callId: 0` (see {@link parseJsonBlob}).
 */
export function decodeCallHangup(bytes: Uint8Array): CallHangupPayload {
    return CALL_HANGUP_SCHEMA.parse(parseJsonBlob(bytes));
}

/**
 * Encode a {@link CallRingingPayload} into the blob for
 * {@link structbuf.csp.e2e.CallRingingLike.hangup} (the structbuf field is named `hangup` for
 * both `call-hangup` and `call-ringing`, see the structbuf class definitions).
 */
export function encodeCallRinging(payload: CallRingingPayload): Uint8Array {
    return encodeJsonBlob({callId: payload.callId});
}

/**
 * Decode the blob of {@link structbuf.csp.e2e.CallRingingLike.hangup} into a validated
 * {@link CallRingingPayload}. Empty bytes decode to `callId: 0` (see {@link parseJsonBlob}).
 */
export function decodeCallRinging(bytes: Uint8Array): CallRingingPayload {
    return CALL_RINGING_SCHEMA.parse(parseJsonBlob(bytes));
}
