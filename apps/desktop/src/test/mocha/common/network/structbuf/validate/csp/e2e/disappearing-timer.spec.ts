import {expect} from 'chai';

import * as structbuf from '~/common/network/structbuf';
import {
    computeDisappearingStamp,
    decodeDisappearingTimer,
    encodeDisappearingTimer,
} from '~/common/network/structbuf/validate/csp/e2e/disappearing-timer';
import {UTF8} from '~/common/utils/codec';

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
