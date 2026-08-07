import {expect} from 'chai';

import {F1MessageMetadata} from '~/common/internal-protobuf/f1-message-metadata';
import * as protobuf from '~/common/network/protobuf';
import {
    F1_DISAPPEARING_TIMER_MAX_SECONDS,
    getF1CompensatedMetadataPaddingLength,
} from '~/common/network/protocol/disappearing-message-metadata';
import {ensureMessageId} from '~/common/network/types';
import {byteJoin} from '~/common/utils/byte';
import {intoUnsignedLong} from '~/common/utils/number';

export function run(): void {
    describe('F1 MessageMetadata field-100 overlay', function () {
        function encodeStandard(paddingLength: number, nickname?: string): Uint8Array {
            const encoder = protobuf.utils.encoder(protobuf.csp_e2e.MessageMetadata, {
                padding: new Uint8Array(paddingLength),
                nickname,
                messageId: intoUnsignedLong(ensureMessageId(0x0123456789abcdefn)),
                createdAt: intoUnsignedLong(1_785_232_707_650n),
            });
            return encoder.encode(new Uint8Array(encoder.byteLength()));
        }

        it('preserves standard fields while decoding field 100 from the same bytes', function () {
            const standard = encodeStandard(8, 'Alice');
            const overlay = F1MessageMetadata.encode({f1DisappearingTimer: 30}).finish();
            const combined = byteJoin(standard, overlay);

            const standardOnly = protobuf.csp_e2e.MessageMetadata.decode(combined);
            expect(standardOnly.nickname).to.equal('Alice');
            expect(standardOnly.messageId.toString()).to.equal('81985529216486895');

            const f1Only = F1MessageMetadata.decode(combined);
            expect(f1Only.f1DisappearingTimer).to.equal(30);

            const decoded = protobuf.validate.csp_e2e.MessageMetadata.decode(combined);
            expect(decoded.nickname).to.equal('Alice');
            expect(decoded.f1DisappearingTimer).to.equal(30);
        });

        it('keeps absent and explicit zero distinct on the wire', function () {
            const absent = F1MessageMetadata.encode({f1DisappearingTimer: undefined}).finish();
            const off = F1MessageMetadata.encode({f1DisappearingTimer: 0}).finish();

            expect(absent).to.have.length(0);
            expect([...off]).to.deep.equal([0xa0, 0x06, 0x00]);
            expect(F1MessageMetadata.decode(absent).f1DisappearingTimer).to.be.undefined;
            expect(F1MessageMetadata.decode(off).f1DisappearingTimer).to.equal(0);
        });

        it('clamps hostile values to 365 days during validated decoding', function () {
            const bytes = byteJoin(
                encodeStandard(8),
                F1MessageMetadata.encode({f1DisappearingTimer: 0xffffffff}).finish(),
            );
            expect(
                protobuf.validate.csp_e2e.MessageMetadata.decode(bytes).f1DisappearingTimer,
            ).to.equal(F1_DISAPPEARING_TIMER_MAX_SECONDS);
        });

        it('keeps serialized length constant across field presence and varint widths', function () {
            const timerValues = [undefined, 0, 1, 30, 300, 604800, 0xffffffff] as const;
            for (const nickname of [undefined, '', 'John Doe', 'nickname-longer-than-sixteen']) {
                const nicknameLength =
                    nickname === undefined ? 0 : new TextEncoder().encode(nickname).byteLength;
                const basePaddingLength = Math.max(0, 16 - nicknameLength);
                const lengths = timerValues.map((timer) => {
                    const overlay = F1MessageMetadata.encode({
                        f1DisappearingTimer: timer,
                    }).finish();
                    const paddingLength = getF1CompensatedMetadataPaddingLength(
                        basePaddingLength,
                        overlay.byteLength,
                    );
                    return byteJoin(encodeStandard(paddingLength, nickname), overlay).byteLength;
                });
                expect(new Set(lengths).size, `nickname=${String(nickname)}`).to.equal(1);
            }
        });
    });
}
