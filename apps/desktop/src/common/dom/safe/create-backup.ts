/**
 * Threema Safe backup CREATION (T10).
 *
 * This is the symmetric counterpart to the audited restore path in `./index.ts` — it builds the
 * android-compatible Safe JSON, derives the master key, compresses, encrypts and uploads the backup.
 * It is intentionally a SEPARATE module so the audited `downloadSafeBackup` path stays untouched; the
 * cross-client format symmetry is guarded by a round-trip unit test (create here -> decode via the
 * unchanged `downloadSafeBackup`).
 *
 * Key derivation, split and crypto mirror the restore path byte-for-byte:
 *
 *     threemaSafeMasterKey  = scrypt(P=password, S=identity, N=2^16, r=8, p=1, dkLen=64)
 *     threemaSafeBackupId   = threemaSafeMasterKey[0..31]
 *     threemaSafeEncryptionKey = threemaSafeMasterKey[32..63]
 *     backup = nonceAhead(XSalsa20-Poly1305(gzip(utf8(json)), threemaSafeEncryptionKey))
 *     PUT {safeServer}/backups/{hex(threemaSafeBackupId)}
 */
import {syncScrypt} from 'scrypt-js';

import {
    NACL_CONSTANTS,
    NONCE_UNGUARDED_SCOPE,
    type PlainData,
    type RawKey,
    wrapRawKey,
} from '~/common/crypto';
import {CREATE_BUFFER_TOKEN} from '~/common/crypto/box';
import type {ServicesForSafeBackup} from '~/common/dom/safe';
import {SafeError} from '~/common/error';
import type {BaseUrl, IdentityString, Nickname} from '~/common/network/types';
import type {ReadonlyUint8Array} from '~/common/types';
import {assert} from '~/common/utils/assert';
import {u8aToBase64} from '~/common/utils/base64';
import {bytesToHex} from '~/common/utils/byte';
import {UTF8} from '~/common/utils/codec';

/**
 * Optional custom Safe server (mirrors `SafeCredentials['customSafeServer']` from `./index.ts`).
 */
export interface CustomSafeServer {
    readonly url: BaseUrl;
    readonly auth?: {
        readonly username: string;
        readonly password: string;
    };
}

/**
 * The identity material a Safe backup is built from. For a freshly created identity, contacts /
 * groups / settings are empty/default (the backup exists to recover the private key + nickname); a
 * future Settings-triggered backup can populate these from the live model.
 */
export interface SafeBackupMaterial {
    /** The Threema ID being backed up (the salt for the master-key derivation). */
    readonly identity: IdentityString;
    /** The raw 32-byte Threema private (client) key. */
    readonly privateKey: ReadonlyUint8Array;
    /** The user's public nickname, if any. */
    readonly nickname?: Nickname;
}

/**
 * Derive the Safe backup id and encryption key from the identity + password. Mirrors `deriveKey` in
 * the audited restore path exactly (scrypt N=2^16, r=8, p=1, dkLen=64; id=first 32B, key=last 32B).
 */
function deriveSafeKey(
    identity: IdentityString,
    password: string,
): {readonly hexBackupId: string; readonly encryptionKey: RawKey<32>} {
    const passwordBytes = UTF8.encode(password);
    const salt = UTF8.encode(identity);
    const masterKey = syncScrypt(passwordBytes, salt, 65536, 8, 1, 64);
    assert(masterKey.byteLength === 64, 'Derived Safe master key must be 64 bytes');
    return {
        hexBackupId: bytesToHex(masterKey.slice(0, 32)),
        encryptionKey: wrapRawKey(masterKey.slice(32, 64), NACL_CONSTANTS.KEY_LENGTH),
    };
}

/**
 * Build the android-compatible Safe backup JSON string for the given material.
 *
 * The shape matches `SAFE_SCHEMA` (and android `ThreemaSafeServiceImpl.getSafeJson`): `info` /
 * `user` / `contacts` / `groups` / `distributionlists` / `settings`. The private key is Base64
 * encoded, exactly as the restore path expects (`base64ToU8a(safeBackup.user.privatekey)`).
 */
function buildSafeBackupJson(material: SafeBackupMaterial): string {
    const backup = {
        info: {
            version: 1,
            device: 'desktop',
        },
        user: {
            privatekey: u8aToBase64(material.privateKey),
            nickname: material.nickname ?? '',
        },
        contacts: [],
        groups: [],
        distributionlists: [],
        settings: {
            syncContacts: false,
        },
    };
    return JSON.stringify(backup);
}

/**
 * Compress (gzip) + encrypt (nonce-ahead XSalsa20-Poly1305) the Safe JSON. Symmetric to the restore
 * path's `decryptBackupBytes` + `decodeBackupBytes`.
 */
async function encryptSafeBackup(
    json: string,
    encryptionKey: RawKey<32>,
    services: ServicesForSafeBackup,
): Promise<ReadonlyUint8Array> {
    const {compressor, crypto} = services;
    let compressed: ReadonlyUint8Array;
    try {
        compressed = await compressor.compress('gzip', UTF8.encode(json));
    } catch (error) {
        throw new SafeError('encoding', 'Compressing backup failed', {from: error});
    }
    try {
        return crypto
            .getSecretBox(encryptionKey.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined)
            .encryptor(CREATE_BUFFER_TOKEN, compressed as PlainData)
            .encryptWithRandomNonceAhead(undefined);
    } catch (error) {
        throw new SafeError('crypto', `Encrypting backup failed: ${error}`, {from: error});
    }
}

/**
 * Upload the encrypted backup to `{safeServer}/backups/{hexBackupId}` via HTTP PUT.
 */
async function putSafeBackup(
    hexBackupId: string,
    encrypted: ReadonlyUint8Array,
    config: ServicesForSafeBackup['config'],
    customSafeServer?: CustomSafeServer,
): Promise<void> {
    const url = new URL(
        `backups/${hexBackupId}`,
        customSafeServer?.url ?? config.safeServerUrl(hexBackupId),
    );

    let response: Response;
    try {
        const headers = new Headers({
            'user-agent': config.USER_AGENT,
            'content-type': 'application/octet-stream',
        });
        if (customSafeServer?.auth !== undefined) {
            const basic = `${customSafeServer.auth.username}:${customSafeServer.auth.password}`;
            headers.set('authorization', `Basic ${u8aToBase64(UTF8.encode(basic))}`);
        }
        response = await fetch(url, {
            method: 'PUT',
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            headers,
            body: encrypted as Uint8Array,
        });
    } catch (error) {
        throw new SafeError('fetch', `Upload request errored: ${error}`, {from: error});
    }

    switch (response.status) {
        case 200:
        case 201:
        case 204:
            // Success
            break;
        case 400:
            throw new SafeError('fetch', 'Upload request failed: Invalid request');
        case 401:
        case 403:
            throw new SafeError('fetch', 'Upload request failed: Not authorized');
        case 413:
            throw new SafeError('fetch', 'Upload request failed: Backup too large');
        case 429:
            throw new SafeError(
                'fetch',
                'Upload request failed: Rate limit reached, please try again later',
            );
        default:
            throw new SafeError(
                'fetch',
                `Upload request returned unexpected status: ${response.status}`,
            );
    }
}

/**
 * Create and upload a Threema Safe backup for the given identity material.
 *
 * IMPORTANT: {@link SafeBackupMaterial.privateKey} is sensitive; the caller must not retain it longer
 * than needed.
 *
 * @param material The identity material to back up (identity, private key, nickname).
 * @param password The Threema Safe password used to derive the backup id / encryption key.
 * @param services Services needed for compressing, encrypting and uploading.
 * @param customSafeServer Optional custom Safe server; defaults to the OPPF `safe.url`.
 * @throws {SafeError} If building, encrypting or uploading the backup fails.
 */
export async function uploadSafeBackup(
    material: SafeBackupMaterial,
    password: string,
    services: ServicesForSafeBackup,
    customSafeServer?: CustomSafeServer,
): Promise<void> {
    const {logging} = services;
    const log = logging.logger('backend.safe.create');
    log.info(`Creating Safe backup for identity ${material.identity}`);

    const {hexBackupId, encryptionKey} = deriveSafeKey(material.identity, password);
    try {
        const json = buildSafeBackupJson(material);
        const encrypted = await encryptSafeBackup(json, encryptionKey, services);
        await putSafeBackup(hexBackupId, encrypted, services.config, customSafeServer);
    } finally {
        encryptionKey.purge();
    }
    log.info(`Safe backup uploaded for identity ${material.identity}`);
}
