import {performance} from 'node:perf_hooks';

import * as argon2 from 'argon2';

import {
    type EncryptedDataWithNonceAhead,
    NACL_CONSTANTS,
    NONCE_UNGUARDED_SCOPE,
    type PlainData,
    type RawKey,
    wrapRawKey,
} from '~/common/crypto';
import {deriveKey} from '~/common/crypto/blake2b';
import {CREATE_BUFFER_TOKEN} from '~/common/crypto/box';
import type {ServicesForKeyStorage} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import {
    type Argon2idParameters,
    ARGON2_MIN_PARAMS,
    Argon2Version,
    KDF_TARGET_RUNTIME_MS,
} from '~/common/key-storage/layers/outer/common';
import type {RawRemoteSecret} from '~/common/network/types';
import {KiB, MiB} from '~/common/types';
import {assert} from '~/common/utils/assert';

/**
 * Key material for password-based encryption/decryption (Argon2id KDF + XSalsa20-Poly1305).
 *
 * Used in {@link InnerKeyStorageV1}, as well as the intermediate key storage layer in newer
 * generations.
 */
export interface PasswordBasedKeyMaterial {
    readonly password: string;
    readonly params: Argon2idParameters;
}

/**
 * Key material for Remote Secret-based encryption/decryption (BLAKE2b key derivation +
 * XSalsa20-Poly1305).
 *
 * Used for the inner key storage layer when Remote Secret protection is active.
 */
export interface RemoteSecretBasedKeyMaterial {
    readonly remoteSecret: RawRemoteSecret;
}

/**
 * Derive a 32-byte key from a low-entropy password using `Argon2id`.
 *
 * Logs a warning if the KDF runtime falls outside of {@link KDF_TARGET_RUNTIME_MS}.
 */
export async function deriveKeyFromPassword(
    services: Pick<ServicesForKeyStorage, 'logging'>,
    {password, params}: PasswordBasedKeyMaterial,
): Promise<RawKey<32>> {
    const log = services.logging.logger('key-storage.crypto');

    const start = performance.now();
    const rawHash = await argon2.hash(password, {
        // Use Argon2id variant.
        type: argon2.argon2id,
        // The version to use.
        version: params.version.toArgon2VersionByte(),
        // We need 32 bytes (NaCl secret key).
        hashLength: NACL_CONSTANTS.KEY_LENGTH,
        // Salt / nonce.
        salt: Buffer.from(params.salt),
        // Number of iterations.
        timeCost: params.iterations,
        // The amount of memory to be used by the hash function, in KiB.
        memoryCost: Math.floor(params.memoryBytes / KiB),
        // Degree of parallelism.
        parallelism: params.parallelism,
        // Return raw hash, not a digest with parameters
        raw: true,
    });
    const duration = performance.now() - start;

    const msg = `KDF ran in ${duration.toFixed(2)} ms`;
    if (duration < KDF_TARGET_RUNTIME_MS.min || duration > KDF_TARGET_RUNTIME_MS.max) {
        log.warn(msg);
    } else {
        log.debug(msg);
    }

    return wrapRawKey(rawHash, NACL_CONSTANTS.KEY_LENGTH);
}

/**
 * Decrypt bytes that were encrypted with a password-derived key (Argon2id + XSalsa20-Poly1305).
 *
 * @throws {KeyStorageError} If decryption fails.
 */
export async function decryptPasswordBased(
    encrypted: EncryptedDataWithNonceAhead,
    keyMaterial: PasswordBasedKeyMaterial,
    services: Pick<ServicesForKeyStorage, 'crypto' | 'logging'>,
): Promise<Uint8Array> {
    const {crypto} = services;

    // Derive the key from the password using Argon2id.
    const key = await deriveKeyFromPassword(services, keyMaterial);

    // Decrypt.
    const secretBox = crypto.getSecretBox(key.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined);
    const decryptor = secretBox.decryptorWithNonceAhead(CREATE_BUFFER_TOKEN, encrypted);
    try {
        return decryptor.decrypt(undefined).plainData;
    } catch (error) {
        throw new KeyStorageError('undecryptable', 'Cannot decrypt', {from: error});
    } finally {
        key.purge();
    }
}

/**
 * Encrypt bytes using a password-derived key (Argon2id + XSalsa20-Poly1305).
 *
 * @throws {KeyStorageError} If encryption fails.
 */
export async function encryptPasswordBased(
    decrypted: Uint8Array,
    keyMaterial: PasswordBasedKeyMaterial,
    services: Pick<ServicesForKeyStorage, 'crypto' | 'logging'>,
): Promise<EncryptedDataWithNonceAhead> {
    const {crypto} = services;

    // Derive the key from the password using Argon2id.
    const key = await deriveKeyFromPassword(services, keyMaterial);

    // Encrypt.
    try {
        return crypto
            .getSecretBox(key.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined)
            .encryptor(CREATE_BUFFER_TOKEN, decrypted as PlainData)
            .encryptWithRandomNonceAhead(undefined);
    } catch (error) {
        throw new KeyStorageError('internal-error', 'Cannot encrypt', {from: error});
    } finally {
        key.purge();
    }
}

/**
 * Decrypt bytes that were encrypted with a Remote Secret-derived key (BLAKE2b + XSalsa20-Poly1305).
 *
 * @throws {KeyStorageError} If decryption fails.
 */
export function decryptRemoteSecretBased(
    encrypted: EncryptedDataWithNonceAhead,
    {remoteSecret}: RemoteSecretBasedKeyMaterial,
    services: Pick<ServicesForKeyStorage, 'crypto'>,
): Uint8Array {
    const {crypto} = services;

    // Derive the Remote Secret Storage Key (RSSK) from the raw Remote Secret.
    const rssk = deriveKey(32, remoteSecret.asReadonly(), {personal: '3ma-rs', salt: 'rssk-d'});

    // Decrypt.
    const secretBox = crypto.getSecretBox(rssk.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined);
    const decryptor = secretBox.decryptorWithNonceAhead(CREATE_BUFFER_TOKEN, encrypted);
    try {
        return decryptor.decrypt(undefined).plainData;
    } catch (error) {
        throw new KeyStorageError('undecryptable', 'Cannot decrypt', {from: error});
    } finally {
        rssk.purge();
    }
}

/**
 * Encrypt bytes using a Remote Secret-derived key (BLAKE2b + XSalsa20-Poly1305).
 *
 * @throws {KeyStorageError} If encryption fails.
 */
export function encryptRemoteSecretBased(
    decrypted: Uint8Array,
    {remoteSecret}: RemoteSecretBasedKeyMaterial,
    services: Pick<ServicesForKeyStorage, 'crypto'>,
): EncryptedDataWithNonceAhead {
    const {crypto} = services;

    // Derive the Remote Secret Storage Key (RSSK) from the raw Remote Secret.
    const rssk = deriveKey(32, remoteSecret.asReadonly(), {personal: '3ma-rs', salt: 'rssk-d'});

    // Encrypt.
    try {
        return crypto
            .getSecretBox(rssk.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined)
            .encryptor(CREATE_BUFFER_TOKEN, decrypted as PlainData)
            .encryptWithRandomNonceAhead(undefined);
    } catch (error) {
        throw new KeyStorageError('internal-error', 'Cannot encrypt', {from: error});
    } finally {
        rssk.purge();
    }
}

/**
 * Benchmark the current hardware and determine Argon2id KDF parameters that target
 * {@link KDF_TARGET_RUNTIME_MS}.
 *
 * This function runs Argon2id with the minimum parameters and extrapolates from the measured
 * runtime to find parameters that hit the target. It may take a few seconds to run.
 */
export async function determineKdfParams(
    services: Pick<ServicesForKeyStorage, 'crypto' | 'logging'>,
): Promise<Argon2idParameters> {
    const log = services.logging.logger('key-storage.crypto');

    // Version: 1.3
    const version = Argon2Version.fromArgon2VersionByte(0x13);
    // Minimal parameters, see docs for {@link ARGON2_MIN_PARAMS}.
    const minParameters = ARGON2_MIN_PARAMS.create;

    // Run a benchmark with the minimum parameters to measure baseline runtime.
    log.debug(
        `Benchmark starting: m=${minParameters.memoryBytes / MiB}M t=${minParameters.iterations} p=${minParameters.parallelism}`,
    );
    const benchmarkStart = performance.now();
    const benchmarkKey = await deriveKeyFromPassword(services, {
        password: 'r3gGN9GDQ5NF6tM6',
        params: {
            version,
            salt: services.crypto.randomBytes(new Uint8Array(minParameters.saltLengthBytes)),
            memoryBytes: minParameters.memoryBytes,
            iterations: minParameters.iterations,
            parallelism: minParameters.parallelism,
        },
    });
    const duration = performance.now() - benchmarkStart;
    benchmarkKey.purge();
    log.debug(`Benchmark completed in ${duration.toFixed(2)} ms`);

    // Determine actual parameters by first extrapolating `memory` then `iterations`. Ensure that
    // the parameters cannot be weakened!

    // First, increase memory.
    let memoryBytes = minParameters.memoryBytes;
    const runtimeRatio = KDF_TARGET_RUNTIME_MS.target / duration;
    let extrapolatedDuration = duration;
    let factor = 1;
    if (runtimeRatio > 4) {
        factor = 4; // 128 MiB → 512 MiB
    } else if (runtimeRatio > 2) {
        factor = 2; // 128 MiB → 256 MiB
    }
    memoryBytes *= factor;
    extrapolatedDuration *= factor;

    // Then increase iterations.
    const iterations = Math.max(
        minParameters.iterations,
        Math.round(
            (minParameters.iterations / extrapolatedDuration) * KDF_TARGET_RUNTIME_MS.target,
        ),
    );
    const parallelism = minParameters.parallelism;
    log.debug(`Benchmark result: m=${memoryBytes / MiB}M t=${iterations} p=${parallelism}`);

    // Random salt.
    const salt = services.crypto.randomBytes(new Uint8Array(minParameters.saltLengthBytes));
    // Sanity-check parameters.
    const parameters = {
        version: Argon2Version.fromArgon2VersionByte(0x13),
        salt,
        memoryBytes,
        iterations,
        parallelism,
    };
    assert(
        parameters.iterations >= minParameters.iterations &&
            parameters.memoryBytes >= minParameters.memoryBytes &&
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            parameters.parallelism >= minParameters.parallelism,
        'Expected KDF parameters to fulfill the minimum requirements',
    );

    return parameters;
}
