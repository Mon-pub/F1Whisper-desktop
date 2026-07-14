import {expect} from 'chai';

import {downloadSafeBackup} from '~/common/dom/safe';
import {uploadSafeBackup} from '~/common/dom/safe/create-backup';
import {ensureIdentityString, ensureNickname} from '~/common/network/types';
import type {ReadonlyUint8Array} from '~/common/types';
import {u8aToBase64} from '~/common/utils/base64';
import {
    makeTestServicesWithoutIdentity,
    type TestServicesWithoutIdentity,
} from '~/test/mocha/common/backend-mocks';

/**
 * Round-trip test for Threema Safe backup CREATION (T10).
 *
 * Proves format SYMMETRY: a backup produced by {@link uploadSafeBackup} is decrypted + decoded by
 * the desktop's UNCHANGED (audited) {@link downloadSafeBackup}. If creation diverged from the
 * restore scheme in derivation, split, encryption or compression, this would fail — which also
 * incidentally re-validates the restore path (T6) against an independent producer.
 */
export function run(): void {
    describe('Threema Safe backup creation', function () {
        const IDENTITY = 'ECHOECHO';
        const PASSWORD = 'correct horse battery staple';
        // Deterministic 32-byte "private key".
        const PRIVATE_KEY: ReadonlyUint8Array = Uint8Array.from(
            {length: 32},
            (_, index) => (index * 7 + 1) % 256,
        );
        const NICKNAME = 'Echo';

        let services: TestServicesWithoutIdentity;
        let originalFetch: typeof globalThis.fetch;
        let uploadedBody: Uint8Array | undefined;
        let uploadedUrl: string | undefined;
        let uploadedMethod: string | undefined;

        beforeEach(function () {
            services = makeTestServicesWithoutIdentity();
            originalFetch = globalThis.fetch;
            uploadedBody = undefined;
            uploadedUrl = undefined;
            uploadedMethod = undefined;
        });

        afterEach(function () {
            globalThis.fetch = originalFetch;
        });

        function requestInfoToUrl(input: RequestInfo | URL): string {
            if (input instanceof URL) {
                return input.href;
            }
            if (typeof input === 'string') {
                return input;
            }
            return input.url;
        }

        // Stub `fetch` so a PUT captures the uploaded (encrypted) body, and a subsequent GET/HEAD
        // serves that exact body back — emulating the Safe server round-trip in-memory.
        function stubFetch(): void {
            globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
                await Promise.resolve();
                const url = requestInfoToUrl(input);
                const method = init?.method ?? 'GET';
                if (method === 'PUT') {
                    uploadedUrl = url;
                    uploadedMethod = method;
                    uploadedBody = new Uint8Array(init?.body as Uint8Array);
                    return new Response(null, {status: 200});
                }
                if (method === 'HEAD') {
                    return new Response(null, {status: uploadedBody === undefined ? 404 : 200});
                }
                // GET
                if (uploadedBody === undefined) {
                    return new Response(null, {status: 404});
                }
                return new Response(uploadedBody.slice().buffer, {status: 200});
            }) as typeof globalThis.fetch;
        }

        it('creates a backup that the unchanged downloadSafeBackup decodes (full round-trip)', async function () {
            stubFetch();

            await uploadSafeBackup(
                {
                    identity: ensureIdentityString(IDENTITY),
                    privateKey: PRIVATE_KEY,
                    nickname: ensureNickname(NICKNAME),
                },
                PASSWORD,
                services,
            );

            expect(uploadedMethod).to.equal('PUT');
            expect(uploadedUrl).to.be.a('string');
            expect(uploadedUrl).to.match(/backups\/[0-9a-f]{64}$/u);
            expect(uploadedBody).to.be.an.instanceOf(Uint8Array);

            const restored = await downloadSafeBackup(
                {identity: ensureIdentityString(IDENTITY), password: PASSWORD},
                services,
            );

            expect(restored.user.privatekey).to.equal(u8aToBase64(PRIVATE_KEY));
            expect(restored.user.nickname).to.equal(NICKNAME);
            expect(restored.info.version).to.equal(1);
            expect(restored.contacts).to.be.an('array').with.lengthOf(0);
            expect(restored.settings.syncContacts).to.equal(false);
        });

        it('cannot be decoded with the wrong password', async function () {
            stubFetch();

            await uploadSafeBackup(
                {identity: ensureIdentityString(IDENTITY), privateKey: PRIVATE_KEY},
                PASSWORD,
                services,
            );

            let threw = false;
            try {
                await downloadSafeBackup(
                    {identity: ensureIdentityString(IDENTITY), password: 'wrong-password'},
                    services,
                );
            } catch {
                threw = true;
            }
            expect(threw).to.equal(true);
        });
    });
}
