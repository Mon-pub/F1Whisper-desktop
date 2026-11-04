import {UTF8} from '@threema/ts-utils/codec/utf8';
import {expect} from 'chai';

import * as structbuf from '~/common/network/structbuf';
import {
    computeDisappearingStamp,
    decodeDisappearingTimer,
    DISAPPEARING_TIMER_MAX_SECONDS,
    encodeDisappearingTimer,
} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';

/**
 * Encode a little-endian uint32 into a 4-byte array.
 */
function le32(value: number): Uint8Array {
    const array = new Uint8Array(4);
    new DataView(array.buffer).setUint32(0, value, true);
    return array;
}

/**
 * Tests for the F1Whisper disappearing-messages timer decode/encode + stamp computation.
 */
export function run(): void {
    describe('disappearing-timer decode/encode', function () {
        it('decodes a 4-byte LE uint32 body (1:1, 0x85)', function () {
            expect(decodeDisappearingTimer(le32(0)).timerSeconds).to.equal(0);
            expect(decodeDisappearingTimer(le32(30)).timerSeconds).to.equal(30);
            expect(decodeDisappearingTimer(le32(604800)).timerSeconds).to.equal(604800);
        });

        it('rejects a body that is not exactly 4 bytes', function () {
            expect(() => decodeDisappearingTimer(new Uint8Array(3))).to.throw();
            expect(() => decodeDisappearingTimer(new Uint8Array(5))).to.throw();
        });

        it('round-trips via the encoder', function () {
            for (const seconds of [0, 1, 30, 3600, 2419200]) {
                const encoder = encodeDisappearingTimer(seconds);
                expect(encoder.byteLength()).to.equal(4);
                const array = encoder.encode(new Uint8Array(encoder.byteLength()));
                expect(decodeDisappearingTimer(array).timerSeconds).to.equal(seconds);
            }
        });

        // F1Whisper fork: received-timer product maximum (P-H01 wire boundary). The wire body is a
        // raw uint32 seconds count, so without this a malicious/buggy peer could advertise up to
        // ~136 years, which (before the bounded-timer helper existed) turned into an immediate-fire
        // hot re-arm loop. Values at/under the max must pass through unchanged; values over it must
        // be clamped down, never rejected (the control message must still apply, just capped).
        describe('received-timer maximum (P-H01)', function () {
            it('leaves values at or under the product maximum unchanged', function () {
                expect(decodeDisappearingTimer(le32(0)).timerSeconds).to.equal(0);
                // Four-week UI preset: comfortably under the max.
                expect(decodeDisappearingTimer(le32(4 * 7 * 24 * 60 * 60)).timerSeconds).to.equal(
                    4 * 7 * 24 * 60 * 60,
                );
                // 25 days: still under the max (this value matters for the timer-helper's chunking,
                // not the clamp, but must not be altered here).
                expect(decodeDisappearingTimer(le32(25 * 24 * 60 * 60)).timerSeconds).to.equal(
                    25 * 24 * 60 * 60,
                );
                expect(
                    decodeDisappearingTimer(le32(DISAPPEARING_TIMER_MAX_SECONDS)).timerSeconds,
                ).to.equal(DISAPPEARING_TIMER_MAX_SECONDS);
            });

            it('clamps a one-year value down to the product maximum', function () {
                const oneYearSeconds = 365 * 24 * 60 * 60;
                expect(oneYearSeconds).to.be.greaterThan(DISAPPEARING_TIMER_MAX_SECONDS);
                expect(decodeDisappearingTimer(le32(oneYearSeconds)).timerSeconds).to.equal(
                    DISAPPEARING_TIMER_MAX_SECONDS,
                );
            });

            it('clamps a uint32::MAX value down to the product maximum', function () {
                const uint32Max = 0xffffffff;
                expect(decodeDisappearingTimer(le32(uint32Max)).timerSeconds).to.equal(
                    DISAPPEARING_TIMER_MAX_SECONDS,
                );
            });
        });

        it('clamps an over-maximum timer through the group container path (0x95)', function () {
            const creatorIdentity = UTF8.encode('CREATOR1');
            const groupId = 0x1122334455667788n;
            const encoder = structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                creatorIdentity,
                groupId,
                innerData: encodeDisappearingTimer(0xffffffff),
            });
            const body = encoder.encode(new Uint8Array(encoder.byteLength()));
            const container = structbuf.validate.csp.e2e.GroupMemberContainer.SCHEMA.parse(
                structbuf.csp.e2e.GroupMemberContainer.decode(body),
            );
            expect(decodeDisappearingTimer(container.innerData).timerSeconds).to.equal(
                DISAPPEARING_TIMER_MAX_SECONDS,
            );
        });

        it('decodes the inner data of a group container body (20 bytes, 0x95)', function () {
            // Build the group wire body: 8B creator + 8B group id + 4B LE timer, via the same
            // group-member-container encoder used on the send path.
            const creatorIdentity = UTF8.encode('CREATOR1');
            const groupId = 0x1122334455667788n;
            const encoder = structbuf.bridge.encoder(structbuf.csp.e2e.GroupMemberContainer, {
                creatorIdentity,
                groupId,
                innerData: encodeDisappearingTimer(300),
            });
            const body = encoder.encode(new Uint8Array(encoder.byteLength()));
            expect(body.byteLength).to.equal(20);

            const container = structbuf.validate.csp.e2e.GroupMemberContainer.SCHEMA.parse(
                structbuf.csp.e2e.GroupMemberContainer.decode(body),
            );
            expect(container.groupId).to.equal(groupId);
            expect(decodeDisappearingTimer(container.innerData).timerSeconds).to.equal(300);
        });
    });

    describe('computeDisappearingStamp', function () {
        it('returns undefined when there is no active timer', function () {
            expect(computeDisappearingStamp(undefined, new Date())).to.be.undefined;
            expect(computeDisappearingStamp(0, new Date())).to.be.undefined;
        });

        it('computes expiresAt = start + timer*1000', function () {
            const start = new Date(1_000_000);
            const stamp = computeDisappearingStamp(60, start);
            expect(stamp).not.to.be.undefined;
            expect(stamp?.disappearingTimerSeconds).to.equal(60);
            expect(stamp?.expireStartedAt.getTime()).to.equal(1_000_000);
            expect(stamp?.expiresAt.getTime()).to.equal(1_000_000 + 60 * 1000);
        });
    });
}
