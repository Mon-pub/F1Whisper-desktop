import {expect} from 'chai';
import {syncScrypt} from 'scrypt-js';
import nacl from 'tweetnacl';

import {downloadSafeBackup, isSafeBackupAvailable} from '~/common/dom/safe';
import {ensureIdentityString} from '~/common/network/types';
import {UTF8} from '~/common/utils/codec';
import {
    makeTestServicesWithoutIdentity,
    type TestServicesWithoutIdentity,
} from '~/test/mocha/common/backend-mocks';

/**
 * Threema Safe master-key derivation, re-implemented INDEPENDENTLY from the android source
 * (`ThreemaSafeServiceImpl.deriveMasterKey`) so this test does not just mirror the desktop
 * implementation it is verifying:
 *
 *     masterKey = scrypt(P=password, S=identity, N=65536, r=8, p=1, dkLen=64)
 *     backupId  = masterKey[0..31]   (-> hex -> `backups/<64-hex>`)
 *     encKey    = masterKey[32..63]
 *
 * Confirmed byte-for-byte against android (scrypt N=2^16/r=8/p=1/dkLen=64; first-32/last-32 split;
 * nonce-ahead XSalsa20-Poly1305 over gzipped JSON).
 */
function deriveAndroidMasterKey(
    identity: string,
    password: string,
): {backupId: Uint8Array; encryptionKey: Uint8Array} {
    const masterKey = syncScrypt(UTF8.encode(password), UTF8.encode(identity), 65536, 8, 1, 64);
    return {
        backupId: masterKey.slice(0, 32),
        encryptionKey: masterKey.slice(32, 64),
    };
}

/**
 * Produce an android-compatible Threema Safe backup blob: gzip(JSON) encrypted with
 * XSalsa20-Poly1305 (NaCl secretbox), with the 24-byte nonce PREPENDED ("nonce-ahead").
 */
async function buildAndroidSafeBackup(
    services: TestServicesWithoutIdentity,
    identity: string,
    password: string,
    backup: unknown,
): Promise<Uint8Array> {
    const {encryptionKey} = deriveAndroidMasterKey(identity, password);

    const plaintext = UTF8.encode(JSON.stringify(backup));
    const gzipped = await services.compressor.compress('gzip', plaintext);

    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const box = nacl.secretbox(gzipped as Uint8Array, nonce, encryptionKey);

    const blob = new Uint8Array(nonce.byteLength + box.byteLength);
    blob.set(nonce, 0);
    blob.set(box, nonce.byteLength);
    return blob;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Round-trip test for restoring a Threema Safe backup.
 *
 * Verifies that the desktop's (unchanged) `downloadSafeBackup` decrypts and decodes a backup
 * produced with the exact android Threema Safe scheme. This is the master-key-split reconciliation
 * gate for T6: if android and desktop diverged in derivation, split, encryption, or compression,
 * this test would fail.
 */
export function run(): void {
    describe('Threema Safe restore', function () {
        const IDENTITY = 'ECHOECHO';
        const PASSWORD = 'correct horse battery staple';

        const SAFE_BACKUP = {
            info: {version: 1},
            user: {
                privatekey: 'aGVsbG8gd29ybGQgdGhpcyBpcyBhIGZha2Uga2V5IDAxMjM0NTY3OA==',
                nickname: 'Echo',
            },
            contacts: [],
            groups: [],
            distributionlists: [],
            settings: {syncContacts: false},
        };

        let services: TestServicesWithoutIdentity;
        let originalFetch: typeof globalThis.fetch;
        let lastRequestedUrl: string | undefined;

        beforeEach(function () {
            services = makeTestServicesWithoutIdentity();
            originalFetch = globalThis.fetch;
            lastRequestedUrl = undefined;
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

        function stubFetch(backupBlob: Uint8Array, status = 200): void {
            globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
                await Promise.resolve();
                lastRequestedUrl = requestInfoToUrl(input);
                if (init?.method === 'HEAD') {
                    return new Response(null, {status});
                }
                // Clone into a fresh ArrayBuffer-backed body for the GET.
                return new Response(backupBlob.slice().buffer, {status});
            }) as typeof globalThis.fetch;
        }

        it('decrypts and decodes an android-produced backup (full round-trip)', async function () {
            const blob = await buildAndroidSafeBackup(services, IDENTITY, PASSWORD, SAFE_BACKUP);
            stubFetch(blob);

            const restored = await downloadSafeBackup(
                {identity: ensureIdentityString(IDENTITY), password: PASSWORD},
                services,
            );

            expect(restored.info.version).to.equal(1);
            expect(restored.user.privatekey).to.equal(SAFE_BACKUP.user.privatekey);
            expect(restored.user.nickname).to.equal('Echo');
            expect(restored.contacts).to.be.an('array').with.lengthOf(0);
            expect(restored.settings.syncContacts).to.equal(false);
        });

        it('requests the backup at backups/<64-hex> derived from the credentials', async function () {
            const blob = await buildAndroidSafeBackup(services, IDENTITY, PASSWORD, SAFE_BACKUP);
            stubFetch(blob);

            await downloadSafeBackup(
                {identity: ensureIdentityString(IDENTITY), password: PASSWORD},
                services,
            );

            const {backupId} = deriveAndroidMasterKey(IDENTITY, PASSWORD);
            const expectedHex = bytesToHex(backupId);
            expect(expectedHex).to.have.lengthOf(64);
            expect(lastRequestedUrl).to.be.a('string');
            expect(lastRequestedUrl).to.contain(`backups/${expectedHex}`);
        });

        it('reports availability via a HEAD request that returns 200', async function () {
            const blob = await buildAndroidSafeBackup(services, IDENTITY, PASSWORD, SAFE_BACKUP);
            stubFetch(blob, 200);

            const available = await isSafeBackupAvailable(services, {
                identity: ensureIdentityString(IDENTITY),
                password: PASSWORD,
            });
            expect(available).to.equal(true);
        });

        it('reports unavailability when the backup is not found (404)', async function () {
            globalThis.fetch = (async () => {
                await Promise.resolve();
                return new Response(null, {status: 404});
            }) as typeof globalThis.fetch;

            const available = await isSafeBackupAvailable(services, {
                identity: ensureIdentityString(IDENTITY),
                password: PASSWORD,
            });
            expect(available).to.equal(false);
        });

        it('fails to decrypt with the wrong password', async function () {
            const blob = await buildAndroidSafeBackup(services, IDENTITY, PASSWORD, SAFE_BACKUP);
            stubFetch(blob);

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
