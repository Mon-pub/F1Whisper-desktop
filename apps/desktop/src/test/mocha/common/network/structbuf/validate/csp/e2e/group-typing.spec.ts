import {expect} from 'chai';

import {
    decodeGroupTyping,
    encodeGroupTyping,
    GROUP_TYPING_BODY_BYTES,
} from '~/common/network/structbuf/validate/csp/e2e/group-typing';
import {ensureGroupId, ensureIdentityString} from '~/common/network/types';

/**
 * Tests for the F1Whisper group-typing-indicator (0x84) decode/encode.
 */
export function run(): void {
    describe('group-typing decode/encode', function () {
        const creator = ensureIdentityString('CREATOR1');
        const groupId = ensureGroupId(0x1122334455667788n);

        it('round-trips a 17-byte body (8B creator + 8B LE group id + 1B flag)', function () {
            for (const isTyping of [true, false]) {
                const encoder = encodeGroupTyping(creator, groupId, isTyping);
                expect(encoder.byteLength()).to.equal(GROUP_TYPING_BODY_BYTES);
                const body = encoder.encode(new Uint8Array(encoder.byteLength()));
                expect(body.byteLength).to.equal(17);

                const decoded = decodeGroupTyping(body);
                expect(decoded.creatorIdentity).to.equal(creator);
                expect(decoded.groupId).to.equal(groupId);
                expect(decoded.isTyping).to.equal(isTyping);
            }
        });

        it('decodes a non-zero flag byte as typing=true', function () {
            const encoder = encodeGroupTyping(creator, groupId, true);
            const body = encoder.encode(new Uint8Array(encoder.byteLength()));
            // Manually set the flag byte to an arbitrary non-zero value.
            body[16] = 0x07;
            expect(decodeGroupTyping(body).isTyping).to.be.true;
        });

        it('rejects a body that is not exactly 17 bytes', function () {
            expect(() => decodeGroupTyping(new Uint8Array(16))).to.throw();
            expect(() => decodeGroupTyping(new Uint8Array(18))).to.throw();
        });
    });
}
