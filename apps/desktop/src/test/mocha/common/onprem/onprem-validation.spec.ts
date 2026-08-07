import {expect} from 'chai';
import nacl from 'tweetnacl';

import {ensureEd25519PublicKey} from '~/common/crypto';
import {OPPF_FILE_SCHEMA, verifyOppfFile} from '~/common/dom/backend/onprem/oppf';
import {base64ToU8a, u8aToBase64} from '~/common/utils/base64';
import {UTF8} from '~/common/utils/codec';
import {TestTweetNaClBackend} from '~/test/mocha/common/backend-mocks';
import {
    MOCK_OPPF,
    CORRECT_OPPF_STRING,
    WRONG_OPPF_SIGNATURE_STRING,
    LICENSE_EXPIRED_STRING,
} from '~/test/mocha/common/onprem/oppf-mock';

export function run(): void {
    describe('Check oppf parsing and validation', function () {
        const pk = '1TrQLW5sipBuw2lcc3Y/gSUGHTzNHuLPN4X9M7Y82m8=';
        const oppf = MOCK_OPPF;
        const crypto = new TestTweetNaClBackend();
        it('parse a valid oppf file', function () {
            const parsedOppf = verifyOppfFile(
                {crypto},
                [ensureEd25519PublicKey(base64ToU8a(pk))],
                UTF8.encode(CORRECT_OPPF_STRING),
            );
            expect(parsedOppf.parsed).to.deep.equal(OPPF_FILE_SCHEMA.parse(oppf));
        });

        it('accepts strict valid YYYY-MM-DD dates as UTC midnight', function () {
            for (const expires of ['2024-02-29', '2300-12-01']) {
                const parsed = OPPF_FILE_SCHEMA.parse({
                    ...oppf,
                    license: {...oppf.license, expires},
                });
                expect(parsed.license.expires.toISOString()).to.equal(`${expires}T00:00:00.000Z`);
            }
        });

        // JavaScript's Date parser normalizes impossible dates and accepts timestamps/locale forms.
        // OPPF only permits exact UTC calendar dates, so all of these must fail at the shared schema
        // boundary for both live and cached parsing.
        it('rejects non-round-tripping or non-YYYY-MM-DD license.expires values', function () {
            for (const malformedExpires of [
                'not-a-date',
                '',
                'NaN',
                '2024-13-45',
                '2024-02-30',
                '2023-02-29',
                '2024-1-01',
                '2024-01-01T00:00:00Z',
                '01/02/2024',
            ]) {
                expect(
                    () =>
                        OPPF_FILE_SCHEMA.parse({
                            ...oppf,
                            license: {...oppf.license, expires: malformedExpires},
                        }),
                    `expected "${malformedExpires}" to be rejected`,
                ).to.throw();
            }
        });

        it('rejects a validly-signed OPPF file whose license.expires is malformed (live-fetch-shaped path)', function () {
            // A fixed, deterministic 32-byte seed (NOT random -- `keyPair.fromSeed` needs no PRNG,
            // unlike plain `nacl.sign.keyPair()`; this is only a throwaway test-signing key, never a
            // security boundary).
            const seed = new Uint8Array(Array.from({length: 32}, (_, i) => (i * 7 + 11) % 256));
            const keypair = nacl.sign.keyPair.fromSeed(seed);
            const body = {
                ...oppf,
                signatureKey: u8aToBase64(keypair.publicKey),
                license: {...oppf.license, expires: 'not-a-date'},
            };
            const bodyString = JSON.stringify(body);
            const signature = nacl.sign.detached(UTF8.encode(bodyString), keypair.secretKey);
            const payload = `${bodyString}\n${u8aToBase64(signature)}`;

            expect(() => {
                verifyOppfFile(
                    {crypto},
                    [ensureEd25519PublicKey(keypair.publicKey)],
                    UTF8.encode(payload),
                );
            }).to.throw();
        });

        it('Do not allow the oppf file verification to succeed when public key is not trusted', function () {
            expect(() => {
                verifyOppfFile(
                    {crypto},
                    [ensureEd25519PublicKey(base64ToU8a(pk))],
                    UTF8.encode(WRONG_OPPF_SIGNATURE_STRING),
                );
            }).to.throw('OPPF file is signed with an unknown signature key');
        });

        it('Do not allow the oppf file verification to succeed when the signature does not match', function () {
            expect(() => {
                verifyOppfFile(
                    {crypto},
                    [
                        ensureEd25519PublicKey(
                            base64ToU8a('VR4nTeVFeao9TcIJn5KaMsuW6Lc4gMC+j8z//zngvNs='),
                        ),
                    ],
                    UTF8.encode(WRONG_OPPF_SIGNATURE_STRING),
                );
            }).to.throw('Ed25519 signature is not valid');
        });

        it('Do not allow the oppf file verification to succeed when the license is expired', function () {
            expect(() => {
                verifyOppfFile(
                    {crypto},
                    [ensureEd25519PublicKey(base64ToU8a(pk))],
                    UTF8.encode(LICENSE_EXPIRED_STRING),
                );
            }).to.throw('OPPF file expired');
        });
    });
}
