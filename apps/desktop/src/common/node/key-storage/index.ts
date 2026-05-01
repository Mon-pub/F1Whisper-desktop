/**
 * The key storage stores essential information about the identity of the user in a protobuf-encoded
 * file. This includes, among other things:
 *
 * - The user's identity and private key
 * - The database encryption key
 * - The device group key
 * - ...
 */

import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';

import type {ThreemaWorkCredentials} from '~/common/device';
import {TRANSFER_HANDLER} from '~/common/index';
import type {
    KeyStorage,
    KeyStorageOnPremConfigStoreData,
    KeyStorageRemoteSecretDataStoreData,
    KeyStorageRemoteSecretWriteData,
    KeyStorageWorkCredentialsStoreData,
    LatestKeyStorageLayers,
    ServicesForKeyStorage,
} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import type {Logger} from '~/common/logging';
import {fileModeInternalObjectIfPosix} from '~/common/node/fs';
import {
    migrateFromDeprecatedKeyStorageFileBytes,
    readOrMigrateFromKeyStorageFileBytes,
} from '~/common/node/key-storage/migration';
import {PROXY_HANDLER} from '~/common/utils/endpoint';
import {pick} from '~/common/utils/object';
import {WritableStore, type IQueryableStore} from '~/common/utils/store';

import {determineKdfParams} from './crypto';
import {
    decryptAndDecodeLatestInnerKeyStorage,
    decryptAndDecodeLatestIntermediateKeyStorage,
    encodeAndEncryptLatestInnerKeyStorage,
    encodeAndEncryptLatestIntermediateKeyStorage,
    encodeLatestOuterKeyStorage,
    getDeprecatedKeyStoragePath,
    getIsDeprecatedKeyStorageFilePresent,
    getIsKeyStorageFilePresent,
    getKeyStoragePath,
} from './helpers';

const SUPPORTS_ONPREM_CONFIG = import.meta.env.BUILD_ENVIRONMENT === 'onprem';
const SUPPORTS_REMOTE_SECRET_DATA =
    import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom';
const SUPPORTS_WORK_CREDENTIALS =
    import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom';

export class FileSystemKeyStorage implements KeyStorage {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _keyStoragePath: string;
    /**
     * Path of the legacy key storage file.
     *
     * @deprecated Do not use outside of the migration logic.
     */
    private readonly _deprecatedKeyStoragePath: string;

    private readonly _onPremConfig: WritableStore<KeyStorageOnPremConfigStoreData> =
        new WritableStore<KeyStorageOnPremConfigStoreData>(undefined);
    private readonly _remoteSecretData: WritableStore<KeyStorageRemoteSecretDataStoreData> =
        new WritableStore<KeyStorageRemoteSecretDataStoreData>(undefined);
    private readonly _workCredentials: WritableStore<KeyStorageWorkCredentialsStoreData> =
        new WritableStore<KeyStorageWorkCredentialsStoreData>(undefined);

    private _isInitialized: boolean = false;

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
    }

    /** @inheritdoc */
    public get isRemoteSecretEncrypted(): boolean {
        this._ensureInitialized();

        if (!SUPPORTS_REMOTE_SECRET_DATA) {
            return false;
        }

        return this.remoteSecretDataStore.get() !== undefined;
    }

    /** @inheritdoc */
    public get onPremConfigStore(): IQueryableStore<KeyStorageOnPremConfigStoreData> {
        if (!SUPPORTS_ONPREM_CONFIG) {
            throw new KeyStorageError(
                'internal-error',
                `Read error (onPremConfig): OnPrem config not supported in ${import.meta.env.BUILD_FLAVOR}`,
            );
        }

        return this._onPremConfig;
    }

    /** @inheritdoc */
    public get remoteSecretDataStore(): IQueryableStore<KeyStorageRemoteSecretDataStoreData> {
        if (!SUPPORTS_REMOTE_SECRET_DATA) {
            throw new KeyStorageError(
                'internal-error',
                `Read error (remoteSecretData): Remote secret not supported in ${import.meta.env.BUILD_FLAVOR}`,
            );
        }

        return this._remoteSecretData;
    }

    /** @inheritdoc */
    public get workCredentialsStore(): IQueryableStore<KeyStorageWorkCredentialsStoreData> {
        if (!SUPPORTS_WORK_CREDENTIALS) {
            throw new Error(
                `Read error: Work data not supported in ${import.meta.env.BUILD_FLAVOR}`,
            );
        }
        return this._workCredentials;
    }

    /** @inheritdoc */
    public async init(
        password: string,
        onIntermediateDecoded?: (data: {
            readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
            readonly isInnerRemoteSecretProtected: boolean;
        }) => Promise<void>,
    ): Promise<{
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
    }> {
        const isDeprecatedFilePresent = getIsDeprecatedKeyStorageFilePresent(
            this._profileDirectoryPath,
        );
        const isCurrentFilePresent = getIsKeyStorageFilePresent(this._profileDirectoryPath);

        if (!isCurrentFilePresent && !isDeprecatedFilePresent) {
            throw new KeyStorageError(
                'not-found',
                'No key storage file found at either the current or deprecated path',
            );
        }

        let result: {
            readonly consumable: {
                readonly outer: LatestKeyStorageLayers['outer']['consumable'];
                readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
                readonly inner: LatestKeyStorageLayers['inner']['consumable'];
            };
            readonly encoded: LatestKeyStorageLayers['outer']['encoded'];
            readonly initialRemoteSecretStoreData?: KeyStorageRemoteSecretDataStoreData;
            readonly isMigrated: boolean;
        };

        // Only legacy file present: Migrate to current format.
        if (isDeprecatedFilePresent && !isCurrentFilePresent) {
            this._log.info('Legacy key storage file detected, migrating to latest format');

            /* eslint-disable @typescript-eslint/no-deprecated */
            const deprecatedFileBytes = await this._readFileBytes(this._deprecatedKeyStoragePath);
            /* eslint-enable @typescript-eslint/no-deprecated */
            result = await migrateFromDeprecatedKeyStorageFileBytes(
                deprecatedFileBytes,
                password,
                this._services,
                onIntermediateDecoded,
            );

            // Non-legacy file is already present: Read and optionally migrate individual layers to
            // latest.
        } else {
            const fileBytes = await this._readFileBytes(this._keyStoragePath);

            result = await readOrMigrateFromKeyStorageFileBytes(
                fileBytes,
                password,
                this._services,
                onIntermediateDecoded,
            );
        }

        // If key storage data was migrated, write the returned `encoded` key storage to the file.
        if (result.isMigrated) {
            await this._writeOrOverrideFile(result.encoded);
            this._log.info('Key storage migrated to latest format and written to disk');
        }

        // Delete legacy key storage file.
        if (isDeprecatedFilePresent) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-deprecated
                await fsPromises.unlink(this._deprecatedKeyStoragePath);
            } catch (error) {
                throw new KeyStorageError(
                    'migration-error',
                    // eslint-disable-next-line @typescript-eslint/no-deprecated
                    `Failed to delete legacy key storage file at: ${this._deprecatedKeyStoragePath}`,
                    {from: error},
                );
            }
        }

        // Set initial values of stores.
        this._setRemoteSecretDataStoreData(result.initialRemoteSecretStoreData);
        this._setOnPremConfigStoreData(result.consumable.intermediate.onPremConfig);
        this._setWorkCredentialsStoreData(result.consumable.intermediate.workCredentials);

        this._isInitialized = true;

        return result.consumable;
    }

    /** @inheritdoc */
    public async create(
        password: string,
        contents: {
            readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
            readonly inner: LatestKeyStorageLayers['inner']['consumable'];
        },
        remoteSecretWriteData: KeyStorageRemoteSecretWriteData | undefined,
    ): Promise<void> {
        if (getIsKeyStorageFilePresent(this._profileDirectoryPath)) {
            throw new KeyStorageError(
                'internal-error',
                `Key storage file already exists at: ${this._keyStoragePath}`,
            );
        }

        // Encode key storage.
        const kdfParams = await determineKdfParams(this._services);
        const intermediateInner = encodeAndEncryptLatestInnerKeyStorage(
            contents.inner,
            remoteSecretWriteData,
            this._services,
        );
        const intermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
            intermediateInner,
            contents.intermediate,
            {
                password,
                params: kdfParams,
            },
            this._services,
        );
        const outer = encodeLatestOuterKeyStorage(intermediate, {
            kdfParameters: {
                $case: 'argon2id',
                argon2id: kdfParams,
            },
        });

        // Write to file.
        await this._writeOrOverrideFile(outer);
        this._log.info('Key storage created and written to disk');

        // Set initial values of stores.
        this._setRemoteSecretDataStoreData(
            remoteSecretWriteData === undefined
                ? undefined
                : {
                      // Ensure the raw Remote Secret is not retained.
                      ...pick(remoteSecretWriteData, ['endpoint', 'hash', 'token'] as const),
                      initialTimeoutMs: 0,
                  },
        );
        this._setOnPremConfigStoreData(contents.intermediate.onPremConfig);
        this._setWorkCredentialsStoreData(contents.intermediate.workCredentials);

        this._isInitialized = true;
    }

    /** @inheritdoc */
    public async readContents(password: string): Promise<{
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
    }> {
        this._ensureInitialized();

        const fileBytes = (await this._readFileBytes(
            this._keyStoragePath,
        )) as unknown as LatestKeyStorageLayers['outer']['encoded'];
        const {intermediate} = await decryptAndDecodeLatestIntermediateKeyStorage(
            fileBytes,
            password,
            this._services,
        );
        const {contents: inner, initialRemoteSecretStoreData} =
            await decryptAndDecodeLatestInnerKeyStorage(intermediate.inner, this._services);

        // Update stores.
        this._setRemoteSecretDataStoreData(initialRemoteSecretStoreData);
        this._setOnPremConfigStoreData(intermediate.onPremConfig);
        this._setWorkCredentialsStoreData(intermediate.workCredentials);

        return {
            intermediate,
            inner,
        };
    }

    /** @inheritdoc */
    public async readIntermediateContents(
        password: string,
    ): Promise<LatestKeyStorageLayers['intermediate']['consumable']> {
        this._ensureInitialized();

        const fileBytes = (await this._readFileBytes(
            this._keyStoragePath,
        )) as unknown as LatestKeyStorageLayers['outer']['encoded'];
        const {intermediate} = await decryptAndDecodeLatestIntermediateKeyStorage(
            fileBytes,
            password,
            this._services,
        );

        // Update stores.
        this._setOnPremConfigStoreData(intermediate.onPremConfig);
        this._setWorkCredentialsStoreData(intermediate.workCredentials);

        return intermediate;
    }

    /** @inheritdoc */
    public async setOnPremConfig(
        password: string,
        onPremConfig: KeyStorageOnPremConfigStoreData,
    ): Promise<void> {
        this._ensureInitialized();

        // Read current.
        const fileBytes = (await this._readFileBytes(
            this._keyStoragePath,
        )) as unknown as LatestKeyStorageLayers['outer']['encoded'];
        const {outer, intermediate} = await decryptAndDecodeLatestIntermediateKeyStorage(
            fileBytes,
            password,
            this._services,
        );

        // Update values.
        const updatedIntermediate: LatestKeyStorageLayers['intermediate']['validated'] = {
            ...intermediate,
            onPremConfig,
        };

        // Encrypt updated intermediate and encode in outer.
        const encryptedIntermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
            intermediate.inner,
            updatedIntermediate,
            {
                password,
                params: outer.kdfParameters.argon2id,
            },
            this._services,
        );
        const encodedOuter = encodeLatestOuterKeyStorage(encryptedIntermediate, outer);

        // Write to file.
        await this._writeOrOverrideFile(encodedOuter);

        // Update store.
        this._setOnPremConfigStoreData(onPremConfig);
    }

    /** @inheritdoc */
    public async setPassword(currentPassword: string, newPassword: string): Promise<void> {
        this._ensureInitialized();

        // Read current.
        const fileBytes = (await this._readFileBytes(
            this._keyStoragePath,
        )) as unknown as LatestKeyStorageLayers['outer']['encoded'];
        const {outer, intermediate} = await decryptAndDecodeLatestIntermediateKeyStorage(
            fileBytes,
            currentPassword,
            this._services,
        );

        // Re-encrypt intermediate with the new password and encode in outer.
        const encryptedIntermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
            intermediate.inner,
            intermediate,
            {
                password: newPassword,
                params: outer.kdfParameters.argon2id,
            },
            this._services,
        );
        const encodedOuter = encodeLatestOuterKeyStorage(encryptedIntermediate, outer);

        // Write to file.
        await this._writeOrOverrideFile(encodedOuter);
    }

    /** @inheritdoc */
    public async setRemoteSecret(
        password: string,
        remoteSecretWriteData: KeyStorageRemoteSecretWriteData | undefined,
    ): Promise<void> {
        this._ensureInitialized();

        // Read current.
        const fileBytes = (await this._readFileBytes(
            this._keyStoragePath,
        )) as unknown as LatestKeyStorageLayers['outer']['encoded'];
        const {outer, intermediate} = await decryptAndDecodeLatestIntermediateKeyStorage(
            fileBytes,
            password,
            this._services,
        );
        const {contents: inner} = await decryptAndDecodeLatestInnerKeyStorage(
            intermediate.inner,
            this._services,
        );

        // Re-encrypt inner.
        const encryptedIntermediateInner = encodeAndEncryptLatestInnerKeyStorage(
            inner,
            remoteSecretWriteData,
            this._services,
        );

        // Re-encrypt intermediate and encode in outer.
        const encryptedIntermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
            encryptedIntermediateInner,
            intermediate,
            {
                password,
                params: outer.kdfParameters.argon2id,
            },
            this._services,
        );
        const encodedOuter = encodeLatestOuterKeyStorage(encryptedIntermediate, outer);

        // Write to file.
        await this._writeOrOverrideFile(encodedOuter);

        // Update store.
        this._setRemoteSecretDataStoreData(
            remoteSecretWriteData === undefined
                ? undefined
                : {
                      // Ensure the raw Remote Secret is not retained.
                      ...pick(remoteSecretWriteData, ['endpoint', 'hash', 'token'] as const),
                      initialTimeoutMs: 0,
                  },
        );
    }

    /** @inheritdoc */
    public async setWorkCredentials(
        password: string,
        workCredentials: ThreemaWorkCredentials,
    ): Promise<void> {
        this._ensureInitialized();

        // Read current.
        const fileBytes = (await this._readFileBytes(
            this._keyStoragePath,
        )) as unknown as LatestKeyStorageLayers['outer']['encoded'];
        const {outer, intermediate} = await decryptAndDecodeLatestIntermediateKeyStorage(
            fileBytes,
            password,
            this._services,
        );

        // Update values.
        const updatedIntermediate: LatestKeyStorageLayers['intermediate']['validated'] = {
            ...intermediate,
            workCredentials: {...workCredentials},
        };

        // Encrypt updated intermediate and encode in outer.
        const encryptedIntermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
            intermediate.inner,
            updatedIntermediate,
            {
                password,
                params: outer.kdfParameters.argon2id,
            },
            this._services,
        );
        const encodedOuter = encodeLatestOuterKeyStorage(encryptedIntermediate, outer);

        // Write to file.
        await this._writeOrOverrideFile(encodedOuter);

        // Update store.
        this._setWorkCredentialsStoreData({...workCredentials});
    }

    /**
     * Ensure the key storage instance is initialized, or throw an error.
     */
    private _ensureInitialized(): void {
        if (!this._isInitialized) {
            throw new KeyStorageError('not-initialized', `Key storage is not initialized`);
        }
    }

    /**
     * Read file bytes from the given path.
     *
     * @throws {KeyStorageError} If reading fails or the file is empty.
     */
    private async _readFileBytes(filePath: string): Promise<Buffer> {
        let bytes: Buffer;
        try {
            bytes = await fsPromises.readFile(filePath);
        } catch (error) {
            throw new KeyStorageError(
                'not-readable',
                `Cannot read key storage file at ${filePath}`,
                {from: error},
            );
        }
        if (bytes.byteLength === 0) {
            throw new KeyStorageError('malformed', `Key storage file at ${filePath} is empty`);
        }

        return bytes;
    }

    /**
     * Write or override the key storage file on disk with new bytes.
     *
     * @throws {KeyStorageError} If writing the file fails.
     */
    private async _writeOrOverrideFile(
        bytes: LatestKeyStorageLayers['outer']['encoded'],
    ): Promise<void> {
        try {
            await fsPromises.writeFile(this._keyStoragePath, bytes, {
                ...fileModeInternalObjectIfPosix(),
            });
        } catch (error) {
            throw new KeyStorageError(
                'not-writable',
                `Cannot write key storage file at ${this._keyStoragePath}`,
                {from: error},
            );
        }
    }

    private _setOnPremConfigStoreData(value: KeyStorageOnPremConfigStoreData): void {
        if (!SUPPORTS_ONPREM_CONFIG && value !== undefined) {
            throw new Error(
                'Not allowed to set OnPrem config store to a value other than undefined in non-OnPrem builds',
            );
        }
        this._onPremConfig.set(value);
    }

    private _setRemoteSecretDataStoreData(value: KeyStorageRemoteSecretDataStoreData): void {
        if (!SUPPORTS_REMOTE_SECRET_DATA && value !== undefined) {
            throw new Error(
                'Not allowed to set remote secret store to a value other than undefined in non-Work builds',
            );
        }
        this._remoteSecretData.set(value);
    }

    private _setWorkCredentialsStoreData(value: KeyStorageWorkCredentialsStoreData): void {
        if (!SUPPORTS_WORK_CREDENTIALS && value !== undefined) {
            throw new Error(
                'Not allowed to set work credentials store to a value other than undefined in non-Work builds',
            );
        }
        this._workCredentials.set(value);
    }
}
