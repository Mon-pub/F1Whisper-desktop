/**
 * The key storage stores essential information about the identity of the user in a protobuf-encoded
 * file. This includes, among other things:
 *
 * - The user's identity and private key
 * - The database encryption key
 * - The device group key
 * - ...
 *
 * # Encoding / Decoding
 *
 * When writing this data, data is protobuf-encoded using the schema {@link InnerKeyStorageV2} and
 * its inner version (u16LE) prepended. If RS is activated, these bytes are encrypted using the data
 * provided by RS. The result is wrapped by the protobuf-encoded {@link IntermediateKeyStorageV1}
 * and version-prepended. Then, the bytes are encrypted using a key derived from a user-provided
 * password using Argon2 (see {@link Argon2MinParams} for details on the parameters). The encrypted
 * data, along with the key derivation parameters, is then encoded again with protobuf, using the
 * schema {@link OuterKeyStorageV2}. The resulting bytes are version-prepended and written to the
 * key storage file.
 *
 *    InnerVersion || Encode(InnerKeyStorage) -> EncryptIfRS -> IntermediateVersion ||
 *    Encode(IntermediateKeyStorage) -> Encrypt → OuterVersion || Encode(OuterKeyStorage) → Write
 *
 * When reading the file, this process is done in reverse.
 *
 *     Read -> Decode(OuterKeyStorage) -> Decrypt -> Decode(IntermediateKeyStorage) -> DecryptIfRS -> Decode(InnerKeyStorage)
 *
 * # Backward Incompatible Versioning / Migrations
 *
 * In case a protobuf-backward-incompatible update occurs, increase the major version number of the
 * corresponding part. Write code that performs the incompatible update and overwrite the file.
 *
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

import * as argon2 from 'argon2';

import {
    ensureEncryptedDataWithNonceAhead,
    NACL_CONSTANTS,
    NONCE_UNGUARDED_SCOPE,
    type PlainData,
    type RawKey,
    wrapRawKey,
} from '~/common/crypto';
import {deriveKey} from '~/common/crypto/blake2b';
import {CREATE_BUFFER_TOKEN} from '~/common/crypto/box';
import type {ThreemaWorkCredentials, ThreemaWorkData} from '~/common/device';
import {TRANSFER_HANDLER} from '~/common/index';
import {
    InnerKeyStorageV1,
    InnerKeyStorageV2,
    IntermediateKeyStorageV1,
    OuterKeyStorageV1,
    OuterKeyStorageV2,
    type IntermediateKeyStorageV1_RemoteSecretProtected,
    type OuterKeyStorageV2_OuterVersion,
} from '~/common/internal-protobuf/key-storage-file';
import {
    ARGON2_MIN_PARAMS,
    type Argon2idParameters,
    Argon2Version,
    OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1,
    type OuterKeyStorageFileContentsV1,
    KDF_TARGET_RUNTIME_MS,
    INNER_KEY_STORAGE_SCHEMA_V1,
    type KeyStorage,
    type InnerKeyStorageFileContentsV1,
    KeyStorageError,
    type ServicesForKeyStorage,
    type KeyStorageOppfConfig,
    type InnerKeyStorageFileContentsV2,
    INTERMEDIATE_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1,
    OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2,
    type OuterKeyStorageFileContentsV2,
    type IntermediateKeyStorageFileContentsV1,
    INNER_KEY_STORAGE_SCHEMA_V2,
    type RemoteSecretWriteData,
    type RemoteSecretStoreData,
    type WorkDataStoreData,
    type IntermediateKeyStorageRsProtectedContents,
} from '~/common/key-storage';
import type {Logger} from '~/common/logging';
import {RsApplicationStartMonitorTask} from '~/common/network/protocol/task/libthreema/rs-monitor';
import {
    ensureBaseUrl,
    ensureRemoteSecretAuthenticationToken,
    ensureRemoteSecretHash,
    type RemoteSecretData,
} from '~/common/network/types';
import {fileModeInternalObjectIfPosix} from '~/common/node/fs';
import {
    getDeprecatedKeyStoragePath,
    getIsDeprecatedKeyStorageFilePresent,
    getIsKeyStorageFilePresent,
    getKeyStoragePath,
} from '~/common/node/key-storage/helpers';
import {deleteSafeStoragePasswordFile} from '~/common/node/safe-storage/helpers';
import {KiB, MiB, type ReadonlyUint8Array, type u53} from '~/common/types';
import {assert, unreachable, unwrap} from '~/common/utils/assert';
import {byteJoin} from '~/common/utils/byte';
import {PROXY_HANDLER} from '~/common/utils/endpoint';
import {bytesLeToU16, intoUnsignedLong, u16ToBytesLe} from '~/common/utils/number';
import {type IQueryableStore, WritableStore} from '~/common/utils/store';

import {
    ensureInnerKeyStorageVersion,
    ensureIntermediateKeyStorageVersion,
    ensureOuterKeyStorageVersion,
    LATEST_INNER_KEY_STORAGE_SCHEMA_VERSION,
    LATEST_INTERMEDIATE_KEY_STORAGE_SCHEMA_VERSION,
    LATEST_OUTER_KEY_STORAGE_SCHEMA_VERSION,
} from './versioning';

/** @inheritdoc */
export class FileSystemKeyStorage implements KeyStorage {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _keyStoragePath: string;
    /**
     * Path of the deprecated (old-generation) key storage file.
     *
     * @deprecated Do not use outside of the migration logic.
     */
    private readonly _deprecatedKeyStoragePath: string;
    private readonly _remoteSecretData: WritableStore<RemoteSecretStoreData> | undefined;
    private readonly _workData: WritableStore<WorkDataStoreData> | undefined;

    /**
     * Create a key storage backed by the file system.
     *
     * @param _profileDirectoryPath Path of the profile directory whose key storage file should be
     *   operated on.
     */
    public constructor(
        private readonly _services: ServicesForKeyStorage,
        private readonly _log: Logger,
        private readonly _profileDirectoryPath: string,
    ) {
        this._keyStoragePath = getKeyStoragePath(this._profileDirectoryPath);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        this._deprecatedKeyStoragePath = getDeprecatedKeyStoragePath(this._profileDirectoryPath);

        // Ensure that the parent directory exists.
        const keyStorageParentDirectory = path.dirname(this._keyStoragePath);
        if (!fs.existsSync(keyStorageParentDirectory)) {
            throw new KeyStorageError(
                'not-found',
                `Key storage directory ${keyStorageParentDirectory} does not exist`,
            );
        }
        this._log.debug(`Key storage path: ${this._keyStoragePath}`);

        this._workData =
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? new WritableStore<WorkDataStoreData>(undefined)
                : undefined;

        this._remoteSecretData =
            import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
                ? new WritableStore<RemoteSecretStoreData>(undefined)
                : undefined;
    }

    public get remoteSecretData(): IQueryableStore<RemoteSecretStoreData> {
        return unwrap(
            this._remoteSecretData,
            'Remote Secret Data must be present when calling remoteSecretData',
        );
    }

    public get workData(): IQueryableStore<WorkDataStoreData> {
        return unwrap(this._workData, 'Threema Work Data must be present when calling workData');
    }

    /** @inheritdoc */
    public async read(password: string): Promise<InnerKeyStorageFileContentsV2> {
        // We introduced a key storage change that externalised version numbers, facilitating
        // backwards incompatible changes, resulting in the need to write a new key storage file. If
        // the new file is not yet present, we need to read the old key storage and write it to the
        // new file. The following migration code may be removed in future versions.
        if (!getIsKeyStorageFilePresent(this._profileDirectoryPath)) {
            this._log.info('No key storage file version 2 found. Migrating from V1 to V2');
            try {
                await this._migrateKeyStorageFromV1ToV2(password);
            } catch (error) {
                this._log.error('Migration failed with error: ', error);
                // Handle the undecryptable error so that the frontend shows the wrong password
                // dialog.
                if (error instanceof KeyStorageError && error.type === 'undecryptable') {
                    throw error;
                }
                throw new KeyStorageError(
                    'migration-error',
                    'The key storage could not be migrated from V1 to V2',
                    {from: error},
                );
            }

            // Delete deprecated key storage file.
            try {
                // Uses a deprecated method because we are interacting with the deprecated key
                // storage file.
                //
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                this._deleteDeprecatedKeyStorageFile();
            } catch (error) {
                throw new KeyStorageError(
                    'migration-error',
                    // eslint-disable-next-line @typescript-eslint/no-deprecated
                    `Failed to delete V1 key storage file at: ${this._deprecatedKeyStoragePath}`,
                    {from: error},
                );
            }
            this._log.info('Successfully migrated key storage from V1 to V2');
        }

        // V1 key storage file should not exist anymore at this point, so attempt to delete it every
        // time the key storage is read.
        if (getIsDeprecatedKeyStorageFilePresent(this._profileDirectoryPath)) {
            try {
                // Uses a deprecated method because we are interacting with the deprecated key
                // storage file.
                //
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                this._deleteDeprecatedKeyStorageFile();
            } catch (error) {
                throw new KeyStorageError(
                    'migration-error',
                    // eslint-disable-next-line @typescript-eslint/no-deprecated
                    `Incomplete migration detected, as V1 key storage file still exists but cannot be deleted at: ${this._deprecatedKeyStoragePath}`,
                    {from: error},
                );
            }
        }

        return (await this._read(password)).keyStorageContent;
    }

    /** @inheritdoc */
    public async write(
        password: string,
        contents: InnerKeyStorageFileContentsV2,
        remoteSecretData?: RemoteSecretWriteData,
    ): Promise<void> {
        // Determine DKF params
        const kdfParams = await this._determineKdfParams();

        const plaintextInner = this._encodeInnerKeyStorageContent(contents);

        // Write file.
        await this._write(
            password,
            {
                inner:
                    remoteSecretData === undefined
                        ? {
                              $case: 'plaintextInner',
                              plaintextInner,
                          }
                        : // If `remoteSecretData` is present, `inner` needs to be encrypted using RS.
                          {
                              $case: 'remoteSecretProtectedInner',
                              remoteSecretProtectedInner: this._encryptRemoteSecretProtectedInner(
                                  plaintextInner,
                                  remoteSecretData,
                              ),
                          },
            },
            kdfParams,
        );

        // If we are in a work build, we update the workCredential store with the current value.
        // Note: Undefined can only happen when the device has not been relinked in a long time,
        // i.e. since before the essential data contained the work credentials.
        if (this._workData !== undefined) {
            const workData: ThreemaWorkData | undefined =
                contents.workCredentials === undefined
                    ? undefined
                    : {workCredentials: {...contents.workCredentials}};
            this._workData.set(workData);
        }

        this._remoteSecretData?.set(
            remoteSecretData === undefined
                ? undefined
                : {
                      endpoint: remoteSecretData.endpoint,
                      hash: remoteSecretData.hash,
                      initialTimeoutMs: 0,
                      token: remoteSecretData.token,
                  },
        );
    }

    /** @inheritdoc */
    public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        const {keyStorageContent, rsWriteData} = await this._read(currentPassword);
        await this.write(newPassword, keyStorageContent, rsWriteData);
        deleteSafeStoragePasswordFile(this._profileDirectoryPath, this._log);
    }

    /** @inheritdoc */
    public async changeWorkCredentials(
        password: string,
        workCredentials: ThreemaWorkCredentials,
    ): Promise<void> {
        const {keyStorageContent, rsWriteData} = await this._read(password);
        const newContent = {...keyStorageContent, workCredentials: {...workCredentials}};
        await this.write(password, newContent, rsWriteData);
        unwrap(
            this._workData,
            'Threema Work Data must be present when changing Threema Work Credentials',
        ).set({workCredentials});
    }

    /** @inheritdoc */
    public async changeCachedOnPremConfig(
        password: string,
        newConfig: KeyStorageOppfConfig,
    ): Promise<void> {
        const {keyStorageContent, rsWriteData} = await this._read(password);
        const newContent: InnerKeyStorageFileContentsV2 = {
            ...keyStorageContent,
            onPremConfig: {...newConfig},
        };
        await this.write(password, newContent, rsWriteData);
    }

    private async _read(password: string): Promise<{
        readonly keyStorageContent: InnerKeyStorageFileContentsV2;
        readonly rsWriteData?: RemoteSecretWriteData;
    }> {
        // Read the key storage and return it.
        const outerKeyStorage = await this._readOuterKeyStorage();

        const keyStorageData = await this._decryptAndValidateKeyStorage(outerKeyStorage, password);

        this._log.info(`Key storage loaded from file`);

        if (this._workData !== undefined) {
            const workData: ThreemaWorkData | undefined =
                keyStorageData.keyStorageContent.workCredentials === undefined
                    ? undefined
                    : {workCredentials: {...keyStorageData.keyStorageContent.workCredentials}};
            this._workData.set(workData);
        }
        return keyStorageData;
    }

    /**
     * Encrypt the intermediate key storage and write the full key storage to the file.
     */
    private async _write(
        password: string,
        contents: IntermediateKeyStorageV1,
        kdfParams: Argon2idParameters,
    ): Promise<void> {
        // Encode and encrypt key storage.
        const encryptedKeyStorage = await this._encryptKeyStorage(contents, password, kdfParams);

        // Write (or overwrite) key storage file.
        await this._writeOuterKeyStorage(encryptedKeyStorage);
    }

    /**
     * Encode the inner key storage contents and prepend current version number in the correct
     * encoding.
     */
    private _encodeInnerKeyStorageContent(content: InnerKeyStorageFileContentsV2): Uint8Array {
        const innerKeyStorageContent = InnerKeyStorageV2.encode({
            databaseKey: content.databaseKey.unwrap(),
            deviceCookie: content.deviceCookie as ReadonlyUint8Array as Uint8Array,
            deviceIds: {
                cspDeviceId: intoUnsignedLong(content.deviceIds.cspDeviceId),
                d2mDeviceId: intoUnsignedLong(content.deviceIds.d2mDeviceId),
            },
            dgk: content.dgk.unwrap(),
            identityData: {
                ck: content.identityData.ck.unwrap(),
                identity: content.identityData.identity,
                serverGroup: content.identityData.serverGroup,
            },
            onPremConfig:
                content.onPremConfig === undefined
                    ? undefined
                    : {
                          lastUpdated: intoUnsignedLong(content.onPremConfig.lastUpdated),
                          oppfCachedConfig: content.onPremConfig.oppfCachedConfig,
                          oppfUrl: content.onPremConfig.oppfUrl,
                      },
            workCredentials: content.workCredentials,
        }).finish();

        return byteJoin(
            u16ToBytesLe(LATEST_INNER_KEY_STORAGE_SCHEMA_VERSION),
            innerKeyStorageContent,
        );
    }

    /**
     * Determine the Argon2id KDF parameters to be used when encrypting the key storage.
     *
     * This function uses a benchmark and might take a few seconds to run. Do not call it more often
     * than necessary!
     */
    private async _determineKdfParams(): Promise<Argon2idParameters> {
        // Version: 1.3
        const version = Argon2Version.fromArgon2VersionByte(0x13);

        // Minimal parameters, see docs for {@link ARGON2_MIN_PARAMS}
        const minParameters = ARGON2_MIN_PARAMS.create;

        // Run a benchmark to determine the number of iterations.
        this._log.debug(
            `Benchmark starting: m=${minParameters.memoryBytes / MiB}M t=${
                minParameters.iterations
            } p=${minParameters.parallelism}`,
        );
        const benchmarkPassword = 'r3gGN9GDQ5NF6tM6';
        const start = performance.now();
        await this._deriveIntermediateKeyStorageKey(benchmarkPassword, {
            version,
            salt: this._services.crypto.randomBytes(new Uint8Array(minParameters.saltLengthBytes)),
            memoryBytes: minParameters.memoryBytes,
            iterations: minParameters.iterations,
            parallelism: minParameters.parallelism,
        });
        const end = performance.now();
        const duration = end - start;
        this._log.debug(`Benchmark completed in ${duration.toFixed(2)} ms`);

        // Determine actual parameters by first extrapolating `memory`
        // then `iterations`. Ensure that the parameters cannot be weakened!

        // First, increase memory
        let memoryBytes = minParameters.memoryBytes;
        const runtimeRatio = KDF_TARGET_RUNTIME_MS.target / duration;
        let extrapolatedDuration = duration;
        let factor = 1;
        if (runtimeRatio > 4) {
            factor = 4; // 128 MiB -> 512 MiB
        } else if (runtimeRatio > 2) {
            factor = 2; // 128 MiB -> 256 MiB
        }
        memoryBytes *= factor;
        extrapolatedDuration *= factor;

        // Then increase iterations
        const iterations = Math.max(
            minParameters.iterations,
            Math.round(
                (minParameters.iterations / extrapolatedDuration) * KDF_TARGET_RUNTIME_MS.target,
            ),
        );
        const parallelism = minParameters.parallelism;
        this._log.debug(
            `Benchmark result: m=${memoryBytes / MiB}M t=${iterations} p=${parallelism}`,
        );

        // Random salt
        const salt = this._services.crypto.randomBytes(
            new Uint8Array(minParameters.saltLengthBytes),
        );

        // Sanity-check parameters
        const parameters = {
            version,
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

    /**
     * Derive a key from a low-entropy password using Argon2id.
     *
     * If `runtimeWarnBounds` is set, then a KDF runtime outside the
     * specified bounds will result in a warning being logged.
     */
    private async _deriveIntermediateKeyStorageKey(
        password: string,
        params: Argon2idParameters,
        runtimeWarnBounds?: {min: u53; max: u53},
    ): Promise<RawKey<32>> {
        // Run KDF
        const start = performance.now();
        const rawHash = await argon2.hash(password, {
            // Use Argon2id variant
            type: argon2.argon2id,
            // The version to use
            version: params.version.toArgon2VersionByte(),
            // We need 32 bytes (NaCl secret key)
            hashLength: NACL_CONSTANTS.KEY_LENGTH,
            // Salt / nonce
            salt: Buffer.from(params.salt),
            // Number of iterations
            timeCost: params.iterations,
            // The amount of memory to be used by the hash function, in KiB
            memoryCost: Math.floor(params.memoryBytes / KiB),
            // Degree of parallelism
            parallelism: params.parallelism,
            // Return raw hash, not a digest with parameters
            raw: true,
        });
        const duration = performance.now() - start;
        const msg = `KDF ran in ${duration.toFixed(2)} ms`;
        if (
            runtimeWarnBounds !== undefined &&
            (duration < runtimeWarnBounds.min || duration > runtimeWarnBounds.max)
        ) {
            this._log.warn(msg);
        } else {
            this._log.debug(msg);
        }
        return wrapRawKey(rawHash, NACL_CONSTANTS.KEY_LENGTH);
    }

    /**
     * Read, decode and validate the outer key storage file.
     *
     * @throws {KeyStorageError} In case reading or decoding the key storage or its version fails.
     */
    private async _readOuterKeyStorage(): Promise<OuterKeyStorageFileContentsV2> {
        // Look up key storage file.
        if (!getIsKeyStorageFilePresent(this._profileDirectoryPath)) {
            throw new KeyStorageError(
                'not-found',
                `Key storage file at ${this._keyStoragePath} does not exist`,
            );
        }

        // Read file content.
        let fileContents: Buffer;
        try {
            fileContents = await fsPromises.readFile(this._keyStoragePath);
        } catch (error) {
            throw new KeyStorageError(
                'not-readable',
                `Key storage file at ${this._keyStoragePath} cannot be read`,
                {from: error},
            );
        }

        // Ensure that file is not empty.
        if (fileContents.byteLength === 0) {
            throw new KeyStorageError(
                'malformed',
                `Key storage file at ${this._keyStoragePath} is empty`,
            );
        }

        // Decode file contents.
        let outerKeyStorageContents: OuterKeyStorageFileContentsV2;
        let version: OuterKeyStorageV2_OuterVersion;
        try {
            const keyStorageFile = OuterKeyStorageV2.decode(fileContents.subarray(2));
            outerKeyStorageContents =
                OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2.parse(keyStorageFile);
            version = ensureOuterKeyStorageVersion(bytesLeToU16(fileContents.subarray(0, 2)));
            assert(
                version === LATEST_OUTER_KEY_STORAGE_SCHEMA_VERSION,
                `Outer key storage version should have version number ${LATEST_OUTER_KEY_STORAGE_SCHEMA_VERSION}, but has ${version}`,
            );
        } catch (error) {
            throw new KeyStorageError('malformed', 'Cannot decode outer key storage file', {
                from: error,
            });
        }

        return outerKeyStorageContents;
    }

    /**
     * Read and decode the deprecated outer key storage file.
     *
     * Note: The key storage is not yet validated. The function ensures that the key storage file is
     * not empty, but – as an example – the KDF parameters may be missing from the file. Full
     * validation happens in the {@link _decryptDeprecatedKeyStorage} method.
     *
     * @deprecated Should only be used for one-time migration from V1 to V2.
     * @throws {KeyStorageError} In case reading or decoding the key storage fails.
     */
    private async _readDeprecatedOuterKeyStorage(): Promise<OuterKeyStorageV1> {
        // Disable eslint rule since we need to parse the deprecated key storage here.
        /* eslint-disable @typescript-eslint/no-deprecated */

        // Look up key storage file.
        if (!getIsDeprecatedKeyStorageFilePresent(this._profileDirectoryPath)) {
            throw new KeyStorageError(
                'not-found',
                `Key storage file for deprecated key storage at ${this._deprecatedKeyStoragePath} does not exist`,
            );
        }

        // Read file content.
        let fileContents: Buffer;
        try {
            fileContents = await fsPromises.readFile(this._deprecatedKeyStoragePath);
        } catch (error) {
            throw new KeyStorageError(
                'not-readable',
                `Key storage file for deprecated key storage at ${this._deprecatedKeyStoragePath} cannot be read`,
                {from: error},
            );
        }

        // Ensure that file is not empty.
        if (fileContents.byteLength === 0) {
            throw new KeyStorageError(
                'malformed',
                `Key storage file for deprecated key storage at ${this._deprecatedKeyStoragePath} is empty`,
            );
        }

        /* eslint-enable @typescript-eslint/no-deprecated */

        // Decode file contents.
        let keyStorageFile: OuterKeyStorageV1;
        try {
            keyStorageFile = OuterKeyStorageV1.decode(fileContents);
        } catch (error) {
            throw new KeyStorageError('malformed', `Cannot decode encrypted key storage file`, {
                from: error,
            });
        }

        return keyStorageFile;
    }

    /**
     * Encode and write the encrypted key storage file.
     *
     * @throws {KeyStorageError} In case writing the key storage fails.
     */
    private async _writeOuterKeyStorage(outerKeyStorage: OuterKeyStorageV2): Promise<void> {
        // Encode
        const outerKeyStorageBytes = OuterKeyStorageV2.encode(outerKeyStorage).finish();

        // Write file
        try {
            const options = {...fileModeInternalObjectIfPosix()};
            await fsPromises.writeFile(
                this._keyStoragePath,
                byteJoin(
                    u16ToBytesLe(LATEST_OUTER_KEY_STORAGE_SCHEMA_VERSION),
                    outerKeyStorageBytes,
                ),
                options,
            );
        } catch (error) {
            throw new KeyStorageError(
                'not-writable',
                `Key storage file at ${this._keyStoragePath} cannot be written`,
                {from: error},
            );
        }
    }

    /**
     * Decrypt and decode the deprecated key storage {@link OuterKeyStorageV1}.
     *
     * @deprecated Should only be used for one-time migration from V1 to V2.
     * @throws {KeyStorageError} In case validation or decryption of the key storage failed.
     */
    private async _decryptDeprecatedKeyStorage(
        outerKeyStorage: OuterKeyStorageV1,
        password: string,
    ): Promise<InnerKeyStorageV1> {
        const {crypto} = this._services;

        // Disable eslint rule since we need to parse the deprecated key storage here.
        /* eslint-disable @typescript-eslint/no-deprecated */

        // Validate encrypted key storage
        let validatedOuterKeyStorage: OuterKeyStorageFileContentsV1;
        try {
            validatedOuterKeyStorage =
                OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1.parse(outerKeyStorage);
        } catch (error) {
            throw new KeyStorageError(
                'invalid',
                `Outer key storage contents do not pass validation`,
                {from: error},
            );
        }
        /* eslint-enable @typescript-eslint/no-deprecated */

        // Decrypt
        const key = await this._deriveIntermediateKeyStorageKey(
            password,
            validatedOuterKeyStorage.kdfParameters.argon2id,
            KDF_TARGET_RUNTIME_MS,
        );
        const secretBox = crypto.getSecretBox(key.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined);
        const decryptor = secretBox.decryptorWithNonceAhead(
            CREATE_BUFFER_TOKEN,
            validatedOuterKeyStorage.encryptedKeyStorage,
        );
        let decryptedBytes: Uint8Array;
        try {
            decryptedBytes = decryptor.decrypt(undefined).plainData;
        } catch (error) {
            throw new KeyStorageError(
                'undecryptable',
                `Cannot decrypt encrypted inner key storage`,
                {
                    from: error,
                },
            );
        }
        key.purge();

        // Decode
        let innerKeyStorage: InnerKeyStorageV1;
        try {
            innerKeyStorage = InnerKeyStorageV1.decode(decryptedBytes);
        } catch (error) {
            throw new KeyStorageError('malformed', `Cannot decode inner key storage`, {
                from: error,
            });
        }

        return innerKeyStorage;
    }

    /**
     * Decrypt and decode the key encrypted content contained in
     * {@link OuterKeyStorageFileContentsV2}
     *
     * @throws {KeyStorageError} In case decryption of the contents fails or if the decrypted
     * contents (including verison numbers) are malformed.
     */
    private async _decryptAndValidateKeyStorage(
        validatedOuterKeyStorage: OuterKeyStorageFileContentsV2,
        password: string,
    ): Promise<{
        readonly keyStorageContent: InnerKeyStorageFileContentsV2;
        readonly rsWriteData?: RemoteSecretWriteData;
    }> {
        const {crypto} = this._services;

        // Decrypt
        const key = await this._deriveIntermediateKeyStorageKey(
            password,
            validatedOuterKeyStorage.kdfParameters.argon2id,
            KDF_TARGET_RUNTIME_MS,
        );

        const secretBox = crypto.getSecretBox(key.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined);
        const decryptor = secretBox.decryptorWithNonceAhead(
            CREATE_BUFFER_TOKEN,
            validatedOuterKeyStorage.encryptedIntermediate,
        );
        let decryptedBytes: Uint8Array;
        try {
            decryptedBytes = decryptor.decrypt(undefined).plainData;
        } catch (error) {
            throw new KeyStorageError(
                'undecryptable',
                `Cannot decrypt encrypted intermediate key storage`,
                {
                    from: error,
                },
            );
        }
        key.purge();

        // Unpack the decrypted intermediate key storage and its version.
        let validatedIntermediateKeyStorage: IntermediateKeyStorageFileContentsV1;
        try {
            // Decode the intermediate key storage.
            //
            // Even though it might be inefficient, we create a sliced copy here instead of using
            // subarray to be sure the correct bytes are accessed.
            const intermediateKeyStorage = IntermediateKeyStorageV1.decode(decryptedBytes.slice(2));

            // Validate the content.
            validatedIntermediateKeyStorage =
                INTERMEDIATE_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1.parse(intermediateKeyStorage);

            // Unpack and validate the version.
            const intermediateKeyStorageVersion = ensureIntermediateKeyStorageVersion(
                bytesLeToU16(decryptedBytes.slice(0, 2)),
            );
            assert(
                intermediateKeyStorageVersion === LATEST_INTERMEDIATE_KEY_STORAGE_SCHEMA_VERSION,
                `Intermediate key storage version should have version number ${LATEST_INTERMEDIATE_KEY_STORAGE_SCHEMA_VERSION}, but has ${intermediateKeyStorageVersion}`,
            );
        } catch (error) {
            throw new KeyStorageError(
                'malformed',
                'Cannot decode or validate intermediate key storage',
                {from: error},
            );
        }

        return await this._decodeAndValidateKeyInnerStorage(validatedIntermediateKeyStorage);
    }

    /**
     * Decode the inner content contained in {@link IntermediateKeyStorageFileContentsV1}
     *
     * @throws {KeyStorageError} In case the decoding fails or the decoded content (including
     * version) number is malformed.
     */
    private async _decodeAndValidateKeyInnerStorage(
        validatedIntermediateKeyStorage: IntermediateKeyStorageFileContentsV1,
    ): Promise<{
        readonly keyStorageContent: InnerKeyStorageFileContentsV2;
        readonly rsWriteData?: RemoteSecretWriteData;
    }> {
        let decryptedInnerBytes: Uint8Array;
        let rsWriteData: RemoteSecretWriteData | undefined = undefined;
        switch (validatedIntermediateKeyStorage.inner.$case) {
            case 'plaintextInner':
                decryptedInnerBytes = validatedIntermediateKeyStorage.inner.plaintextInner;
                break;

            case 'remoteSecretProtectedInner':
                // Decrypt inner bytes is protected by RS.
                ({decryptedInnerBytes, rsWriteData} = await this._decryptRemoteSecretProtectedInner(
                    validatedIntermediateKeyStorage.inner.remoteSecretProtectedInner,
                ));
                break;

            default:
                unreachable(validatedIntermediateKeyStorage.inner);
        }

        // Unpack the inner key storage and its version.
        let innerKeyStorageData: InnerKeyStorageFileContentsV2;
        try {
            // Decode the inner key storage.
            //
            // Even though it might be inefficient, we create a sliced copy here instead of using
            // subarray to be sure the correct bytes are accessed.
            const innerKeyStorage = InnerKeyStorageV2.decode(decryptedInnerBytes.slice(2));

            // Validate the fields of the inner key storage.
            innerKeyStorageData = INNER_KEY_STORAGE_SCHEMA_V2.parse(innerKeyStorage);

            const innerKeyStorageVersion = ensureInnerKeyStorageVersion(
                bytesLeToU16(decryptedInnerBytes.slice(0, 2)),
            );

            assert(
                innerKeyStorageVersion === LATEST_INNER_KEY_STORAGE_SCHEMA_VERSION,
                `Inner key storage version should have version number ${LATEST_INNER_KEY_STORAGE_SCHEMA_VERSION}, but has ${innerKeyStorageVersion}`,
            );
        } catch (error) {
            throw new KeyStorageError('malformed', `Cannot decode or validate inner key storage`, {
                from: error,
            });
        }

        return {keyStorageContent: innerKeyStorageData, rsWriteData};
    }

    /**
     * Decrypt the `encryptedInner` contained in the given
     * {@link IntermediateKeyStorageV1_RemoteSecretProtected}. Note: Fetches the required
     * {@link RawRemoteSecret} on its own, and updates the `_remoteSecretData` store if successful.
     *
     * @throws {KeyStorageError} In case decryption of the contents fails.
     */
    private async _decryptRemoteSecretProtectedInner(
        remoteSecretProtectedInner: IntermediateKeyStorageRsProtectedContents,
    ): Promise<{
        readonly decryptedInnerBytes: Uint8Array;
        readonly rsWriteData: RemoteSecretWriteData;
    }> {
        const {crypto} = this._services;
        const remoteSecretData: RemoteSecretData = {
            endpoint: ensureBaseUrl(
                remoteSecretProtectedInner.onPremCachedRemoteSecretEndpointUrl,
                'https:',
            ),
            hash: ensureRemoteSecretHash(remoteSecretProtectedInner.remoteSecretHash),
            token: ensureRemoteSecretAuthenticationToken(
                remoteSecretProtectedInner.remoteSecretAuthenticationToken,
            ),
        };

        // Run `RsApplicationStartMonitorTask` until it yields the Remote Secret. Note: The task
        // itself is supposed to handle any errors, so this is expected not to fail.
        const task = new RsApplicationStartMonitorTask(this._services, remoteSecretData);
        const {remoteSecret, initialTimeoutMs} = await task.run();

        // Decrypt
        const rssk = deriveKey(32, remoteSecret.asReadonly(), {
            personal: '3ma-rs',
            salt: 'rssk-d',
        });
        const secretBox = crypto.getSecretBox(rssk.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined);
        const decryptor = secretBox.decryptorWithNonceAhead(
            CREATE_BUFFER_TOKEN,
            ensureEncryptedDataWithNonceAhead(remoteSecretProtectedInner.encryptedInner),
        );

        let decryptedInnerBytes: Uint8Array;
        try {
            decryptedInnerBytes = decryptor.decrypt(undefined).plainData;
        } catch (error) {
            throw new KeyStorageError(
                'undecryptable',
                `Cannot decrypt remote secret protected inner`,
                {
                    from: error,
                },
            );
        }
        rssk.purge();

        // Update `this._remoteSecretData` store with the `RemoteSecretData` and the initial
        // timeout.
        assert(
            this._remoteSecretData !== undefined,
            'Expected _remoteSecretData store to exist because inner key storage was encrypted using RS',
        );
        this._remoteSecretData.set({
            ...remoteSecretData,
            initialTimeoutMs,
        });

        return {decryptedInnerBytes, rsWriteData: {...remoteSecretData, key: remoteSecret}};
    }

    /**
     * Encrypt the RS-protected inner key storage and wrap it into
     * {@link IntermediateKeyStorageV1_RemoteSecretProtected}.
     */
    private _encryptRemoteSecretProtectedInner(
        plaintextInnerBytes: Uint8Array,
        remoteSecretData: RemoteSecretWriteData,
    ): IntermediateKeyStorageV1_RemoteSecretProtected {
        const {crypto} = this._services;

        const rssk = deriveKey(32, remoteSecretData.key.asReadonly(), {
            personal: '3ma-rs',
            salt: 'rssk-d',
        });

        const encryptedInnerBytes = crypto
            .getSecretBox(rssk.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined)
            .encryptor(CREATE_BUFFER_TOKEN, plaintextInnerBytes as PlainData)
            .encryptWithRandomNonceAhead(undefined);

        rssk.purge();

        return {
            encryptedInner: encryptedInnerBytes,
            onPremCachedRemoteSecretEndpointUrl: remoteSecretData.endpoint.toString(),
            remoteSecretAuthenticationToken:
                remoteSecretData.token as ReadonlyUint8Array as Uint8Array,
            remoteSecretHash: remoteSecretData.hash as ReadonlyUint8Array as Uint8Array,
        };
    }

    /**
     * Encode and encrypt the intermediate key storage and wrap it into {@link OuterKeyStorageV2}
     */
    private async _encryptKeyStorage(
        intermediateKeyStorage: IntermediateKeyStorageV1,
        password: string,
        kdfParameters: Argon2idParameters,
    ): Promise<OuterKeyStorageV2> {
        const {crypto} = this._services;

        const decryptedIntermediateKeyStorageBytes = byteJoin(
            u16ToBytesLe(LATEST_INTERMEDIATE_KEY_STORAGE_SCHEMA_VERSION),
            IntermediateKeyStorageV1.encode(intermediateKeyStorage).finish(),
        );

        // Encrypt
        const key = await this._deriveIntermediateKeyStorageKey(
            password,
            kdfParameters,
            KDF_TARGET_RUNTIME_MS,
        );

        const encryptedKeyStorageBytes = crypto
            .getSecretBox(key.asReadonly(), NONCE_UNGUARDED_SCOPE, undefined)
            .encryptor(CREATE_BUFFER_TOKEN, decryptedIntermediateKeyStorageBytes as PlainData)
            .encryptWithRandomNonceAhead(undefined);
        key.purge();

        // Encode
        return {
            encryptedIntermediate: encryptedKeyStorageBytes,
            kdfParameters: {
                $case: 'argon2id',
                argon2id: {
                    version: kdfParameters.version.toProtobuf(),
                    salt: kdfParameters.salt,
                    memoryBytes: kdfParameters.memoryBytes,
                    iterations: kdfParameters.iterations,
                    parallelism: kdfParameters.parallelism,
                },
            },
        };
    }

    /**
     * Migrate the key storage V1 that lies in `this._deprecatedKeyStoragePath` and write it
     * `this._keyStoragePath`.
     *
     * @throws {KeyStorageError} if the migration fails.
     */
    private async _migrateKeyStorageFromV1ToV2(password: string): Promise<void> {
        // Entering the migration, hence allowing the usage of deprecated functiions.
        /* eslint-disable @typescript-eslint/no-deprecated */

        // Read outer key storage.
        const outerKeyStorage = await this._readDeprecatedOuterKeyStorage();

        // We do not expect to have any users with a version of the key storage that is older than
        // the last migration. Therefore, we do not run the migrations here and just expect the old
        // key storage to be correct.

        // Decrypt inner key storage.
        const innerKeyStorage = await this._decryptDeprecatedKeyStorage(outerKeyStorage, password);

        // Validate inner key storage.
        let keyStorageContents: InnerKeyStorageFileContentsV1;
        try {
            keyStorageContents = INNER_KEY_STORAGE_SCHEMA_V1.parse(innerKeyStorage);
        } catch (error) {
            throw new KeyStorageError(
                'invalid',
                'Decrypted key storage contents do not pass validation',
                {from: error},
            );
        }

        this._log.info(
            `Deprecated key storage loaded from file (schema versions: outer=${outerKeyStorage.schemaVersion} inner=${innerKeyStorage.schemaVersion})`,
        );

        /* eslint-enable @typescript-eslint/no-deprecated */

        if (this._workData !== undefined) {
            const workData: ThreemaWorkData | undefined =
                keyStorageContents.workCredentials === undefined
                    ? undefined
                    : {workCredentials: {...keyStorageContents.workCredentials}};
            this._workData.set(workData);
        }

        const intermediateKeyStorage: IntermediateKeyStorageV1 = {
            inner: {
                $case: 'plaintextInner',
                plaintextInner: this._encodeInnerKeyStorageContent({
                    ...keyStorageContents,
                }),
            },
        };

        // Determine the parameters.
        const kdfParameters = await this._determineKdfParams();

        // Write the migrated content to a new file.
        await this._write(password, intermediateKeyStorage, kdfParameters);
    }

    /**
     * Deletes the V1 key storage file from the profile directory.
     *
     * @throws If the file could not be deleted.
     * @deprecated Should only be used for one-time migration from V1 to V2.
     */
    private _deleteDeprecatedKeyStorageFile(): void {
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        fs.unlinkSync(this._deprecatedKeyStoragePath);
        this._log.info(
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            `Successfully deleted V1 key storage file at: ${this._deprecatedKeyStoragePath}`,
        );
    }
}
