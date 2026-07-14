import {expect} from 'chai';

import {O2oCallAnswerAction, O2oCallRejectReason} from '~/common/enum';
import {
    CALL_ANSWER_SCHEMA,
    CALL_HANGUP_SCHEMA,
    CALL_ICE_CANDIDATE_SCHEMA,
    CALL_OFFER_SCHEMA,
    CALL_RINGING_SCHEMA,
    decodeCallAnswer,
    decodeCallHangup,
    decodeCallIceCandidate,
    decodeCallOffer,
    decodeCallRinging,
    encodeCallAnswer,
    encodeCallHangup,
    encodeCallIceCandidate,
    encodeCallOffer,
    encodeCallRinging,
    type CallAnswerPayload,
    type CallHangupPayload,
    type CallIceCandidatePayload,
    type CallOfferPayload,
    type CallRingingPayload,
} from '~/common/network/protocol/call/o2o-call-signaling';
import {ensureCallId} from '~/common/network/types';
import {UTF8} from '~/common/utils/codec';

/**
 * VoIP 1:1 call signaling codec tests.
 *
 * These assert bit-for-bit interop with the Android/iOS clients: exact JSON field names/values,
 * `callId` u32 bounds, `call-answer` accept/reject discrimination via `action`, and the
 * empty-object tolerance for `call-hangup` / `call-ringing`.
 */
export function run(): void {
    describe('o2o-call-signaling', function () {
        describe('call-offer (0x60)', function () {
            it('round-trips a valid offer', function () {
                const payload: CallOfferPayload = {
                    callId: ensureCallId(1234567890),
                    offer: {sdpType: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n'},
                };
                const bytes = encodeCallOffer(payload);
                expect(JSON.parse(UTF8.decode(bytes))).to.deep.equal({
                    callId: 1234567890,
                    offer: {sdpType: 'offer', sdp: payload.offer.sdp},
                });
                expect(decodeCallOffer(bytes)).to.deep.equal(payload);
            });

            it('assumes callId 0 when absent', function () {
                const bytes = UTF8.encode(JSON.stringify({offer: {sdpType: 'offer', sdp: 'x'}}));
                const decoded = decodeCallOffer(bytes);
                expect(decoded.callId).to.equal(0);
            });

            it('rejects an sdpType other than "offer"', function () {
                const bytes = UTF8.encode(
                    JSON.stringify({callId: 1, offer: {sdpType: 'answer', sdp: 'x'}}),
                );
                expect(() => decodeCallOffer(bytes)).to.throw();
            });

            it('rejects a missing offer', function () {
                const bytes = UTF8.encode(JSON.stringify({callId: 1}));
                expect(() => CALL_OFFER_SCHEMA.parse(JSON.parse(UTF8.decode(bytes)))).to.throw();
            });
        });

        describe('call-answer (0x61)', function () {
            it('round-trips an accept', function () {
                const payload: CallAnswerPayload = {
                    callId: ensureCallId(42),
                    action: O2oCallAnswerAction.ACCEPT,
                    answer: {sdpType: 'answer', sdp: 'v=0\r\n'},
                };
                const bytes = encodeCallAnswer(payload);
                expect(JSON.parse(UTF8.decode(bytes))).to.deep.equal({
                    callId: 42,
                    action: 1,
                    answer: {sdpType: 'answer', sdp: 'v=0\r\n'},
                });
                expect(decodeCallAnswer(bytes)).to.deep.equal(payload);
            });

            it('round-trips an accept with a pranswer', function () {
                const payload: CallAnswerPayload = {
                    callId: ensureCallId(43),
                    action: O2oCallAnswerAction.ACCEPT,
                    answer: {sdpType: 'pranswer', sdp: 'v=0\r\n'},
                };
                const bytes = encodeCallAnswer(payload);
                expect(decodeCallAnswer(bytes)).to.deep.equal(payload);
            });

            it('round-trips a reject', function () {
                const payload: CallAnswerPayload = {
                    callId: ensureCallId(7),
                    action: O2oCallAnswerAction.REJECT,
                    rejectReason: O2oCallRejectReason.BUSY,
                };
                const bytes = encodeCallAnswer(payload);
                expect(JSON.parse(UTF8.decode(bytes))).to.deep.equal({
                    callId: 7,
                    action: 0,
                    rejectReason: 1,
                });
                expect(decodeCallAnswer(bytes)).to.deep.equal(payload);
            });

            const rejectReasons: readonly O2oCallRejectReason[] = [
                O2oCallRejectReason.UNKNOWN,
                O2oCallRejectReason.BUSY,
                O2oCallRejectReason.TIMEOUT,
                O2oCallRejectReason.REJECTED,
                O2oCallRejectReason.DISABLED,
                O2oCallRejectReason.OFF_HOURS,
            ];
            for (const rejectReason of rejectReasons) {
                it(`decodes reject reason ${rejectReason}`, function () {
                    const bytes = UTF8.encode(
                        JSON.stringify({callId: 1, action: 0, rejectReason}),
                    );
                    const decoded = decodeCallAnswer(bytes);
                    expect(decoded.action).to.equal(O2oCallAnswerAction.REJECT);
                    if (decoded.action === O2oCallAnswerAction.REJECT) {
                        expect(decoded.rejectReason).to.equal(rejectReason);
                    }
                });
            }

            it('discriminates accept vs reject via action, never both', function () {
                const accept = CALL_ANSWER_SCHEMA.parse({
                    callId: 1,
                    action: 1,
                    answer: {sdpType: 'answer', sdp: 'x'},
                });
                const reject = CALL_ANSWER_SCHEMA.parse({
                    callId: 1,
                    action: 0,
                    rejectReason: 3,
                });
                expect(accept.action).to.equal(O2oCallAnswerAction.ACCEPT);
                expect(reject.action).to.equal(O2oCallAnswerAction.REJECT);
                expect('answer' in reject).to.be.false;
                expect('rejectReason' in accept).to.be.false;
            });

            it('rejects an accept without answer data', function () {
                expect(() => CALL_ANSWER_SCHEMA.parse({callId: 1, action: 1})).to.throw();
            });

            it('rejects an invalid action value', function () {
                expect(() => CALL_ANSWER_SCHEMA.parse({callId: 1, action: 2})).to.throw();
            });
        });

        describe('call-ice-candidate (0x62)', function () {
            it('round-trips a single candidate', function () {
                const payload: CallIceCandidatePayload = {
                    callId: ensureCallId(99),
                    removed: false,
                    candidates: [
                        {
                            candidate: 'candidate:1 1 UDP 2130706431 10.0.0.1 12345 typ host',
                            sdpMid: '0',
                            sdpMLineIndex: 0,
                            ufrag: 'abcd',
                        },
                    ],
                };
                const bytes = encodeCallIceCandidate(payload);
                expect(JSON.parse(UTF8.decode(bytes))).to.deep.equal({
                    callId: 99,
                    removed: false,
                    candidates: [
                        {
                            candidate: payload.candidates[0]?.candidate,
                            sdpMid: '0',
                            sdpMLineIndex: 0,
                            ufrag: 'abcd',
                        },
                    ],
                });
                expect(decodeCallIceCandidate(bytes)).to.deep.equal(payload);
            });

            it('round-trips multiple candidates with null fields', function () {
                const payload: CallIceCandidatePayload = {
                    callId: ensureCallId(100),
                    removed: false,
                    candidates: [
                        {candidate: 'a', sdpMid: null, sdpMLineIndex: null, ufrag: null},
                        {candidate: 'b', sdpMid: '1', sdpMLineIndex: 1, ufrag: null},
                    ],
                };
                const bytes = encodeCallIceCandidate(payload);
                expect(decodeCallIceCandidate(bytes)).to.deep.equal(payload);
            });

            it('defaults optional candidate fields to null when absent', function () {
                const bytes = UTF8.encode(
                    JSON.stringify({callId: 1, removed: false, candidates: [{candidate: 'a'}]}),
                );
                const decoded = decodeCallIceCandidate(bytes);
                expect(decoded.candidates).to.deep.equal([
                    {candidate: 'a', sdpMid: null, sdpMLineIndex: null, ufrag: null},
                ]);
            });

            it('rejects an empty candidates array', function () {
                const bytes = UTF8.encode(JSON.stringify({callId: 1, removed: false, candidates: []}));
                expect(() => decodeCallIceCandidate(bytes)).to.throw();
            });

            it('rejects a missing candidate string', function () {
                expect(() =>
                    CALL_ICE_CANDIDATE_SCHEMA.parse({
                        callId: 1,
                        removed: false,
                        candidates: [{sdpMid: '0'}],
                    }),
                ).to.throw();
            });
        });

        describe('call-hangup (0x63)', function () {
            it('round-trips a hangup', function () {
                const payload: CallHangupPayload = {callId: ensureCallId(555)};
                const bytes = encodeCallHangup(payload);
                expect(JSON.parse(UTF8.decode(bytes))).to.deep.equal({callId: 555});
                expect(decodeCallHangup(bytes)).to.deep.equal(payload);
            });

            it('decodes empty bytes as callId 0 (legacy empty hangup)', function () {
                const decoded = decodeCallHangup(new Uint8Array(0));
                expect(decoded.callId).to.equal(0);
            });

            it('decodes an empty JSON object', function () {
                const decoded = CALL_HANGUP_SCHEMA.parse(
                    JSON.parse(UTF8.decode(UTF8.encode('{}'))),
                );
                expect(decoded.callId).to.equal(0);
            });
        });

        describe('call-ringing (0x64)', function () {
            it('round-trips a ringing', function () {
                const payload: CallRingingPayload = {callId: ensureCallId(321)};
                const bytes = encodeCallRinging(payload);
                expect(JSON.parse(UTF8.decode(bytes))).to.deep.equal({callId: 321});
                expect(decodeCallRinging(bytes)).to.deep.equal(payload);
            });

            it('decodes empty bytes as callId 0 (legacy empty ringing)', function () {
                const decoded = decodeCallRinging(new Uint8Array(0));
                expect(decoded.callId).to.equal(0);
            });

            it('decodes an empty JSON object', function () {
                const decoded = CALL_RINGING_SCHEMA.parse(
                    JSON.parse(UTF8.decode(UTF8.encode('{}'))),
                );
                expect(decoded.callId).to.equal(0);
            });
        });

        describe('callId u32 bounds', function () {
            it('accepts the maximum u32 value', function () {
                const bytes = UTF8.encode(
                    JSON.stringify({callId: 0xffffffff, offer: {sdpType: 'offer', sdp: 'x'}}),
                );
                expect(decodeCallOffer(bytes).callId).to.equal(0xffffffff);
            });

            it('rejects a negative callId', function () {
                const bytes = UTF8.encode(
                    JSON.stringify({callId: -1, offer: {sdpType: 'offer', sdp: 'x'}}),
                );
                expect(() => decodeCallOffer(bytes)).to.throw();
            });

            it('rejects a callId beyond the u32 range', function () {
                const bytes = UTF8.encode(
                    JSON.stringify({callId: 0x100000000, offer: {sdpType: 'offer', sdp: 'x'}}),
                );
                expect(() => decodeCallOffer(bytes)).to.throw();
            });

            it('rejects a non-integer callId', function () {
                const bytes = UTF8.encode(
                    JSON.stringify({callId: 1.5, offer: {sdpType: 'offer', sdp: 'x'}}),
                );
                expect(() => decodeCallOffer(bytes)).to.throw();
            });
        });
    });
}
