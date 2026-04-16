import type {ServicesForBackend} from '~/common/backend';
import {
    InnerKeyStorage_Version,
    IntermediateKeyStorage_Version,
    OuterKeyStorage_Version,
    type InnerKeyStorageV3,
    type IntermediateKeyStorageV11,
    type OuterKeyStorageV2,
    type ThreemaWorkCredentials,
} from '~/common/internal-protobuf/key-storage-file';
import {
    INNER_KEY_STORAGE_V3_ENCODING_HELPERS,
    type DecryptedEncodedInnerKeyStorageV3Bytes,
    type InnerKeyStorageV3Data,
    type RemoteSecretEncryptedEncodedInnerKeyStorageV3Bytes,
    type ValidatedInnerKeyStorageV3,
} from '~/common/key-storage/layers/inner/v3';
import {
    INTERMEDIATE_KEY_STORAGE_V1_1_ENCODING_HELPERS,
    type DecryptedEncodedIntermediateKeyStorageV1_1Bytes,
    type EncryptedEncodedIntermediateKeyStorageV1_1Bytes,
    type IntermediateKeyStorageV1_1Data,
    type ValidatedIntermediateKeyStorageV1_1,
} from '~/common/key-storage/layers/intermediate/v1_1';
import {
    OUTER_KEY_STORAGE_V2_ENCODING_HELPERS,
    type EncodedOuterKeyStorageV2Bytes,
    type OuterKeyStorageV2Data,
    type ValidatedOuterKeyStorageV2,
} from '~/common/key-storage/layers/outer/v2';
import type {RawRemoteSecret, RemoteSecretData} from '~/common/network/types';
import type {u53} from '~/common/types';
import type {ProxyMarked} from '~/common/utils/endpoint';
import type {IQueryableStore} from '~/common/utils/store';

/**
 * Mapping for the various manifestations of data for the latest key storage version, by layer.
 */
export interface LatestKeyStorageLayers {
    readonly outer: {
        readonly encoded: EncodedOuterKeyStorageV2Bytes;
        readonly decoded: OuterKeyStorageV2;
        readonly validated: ValidatedOuterKeyStorageV2;
        readonly consumable: OuterKeyStorageV2Data;
    };
    readonly intermediate: {
        readonly encrypted: EncryptedEncodedIntermediateKeyStorageV1_1Bytes;
        readonly encoded: DecryptedEncodedIntermediateKeyStorageV1_1Bytes;
        readonly decoded: IntermediateKeyStorageV11;
        readonly validated: ValidatedIntermediateKeyStorageV1_1;
        readonly consumable: IntermediateKeyStorageV1_1Data;
    };
    readonly inner: {
        readonly encrypted: RemoteSecretEncryptedEncodedInnerKeyStorageV3Bytes;
        readonly encoded: DecryptedEncodedInnerKeyStorageV3Bytes;
        readonly decoded: InnerKeyStorageV3;
        readonly validated: ValidatedInnerKeyStorageV3;
        readonly consumable: InnerKeyStorageV3Data;
    };
}

export const LATEST_KEY_STORAGE_ENCODING_HELPERS = {
    outer: OUTER_KEY_STORAGE_V2_ENCODING_HELPERS,
    intermediate: INTERMEDIATE_KEY_STORAGE_V1_1_ENCODING_HELPERS,
    inner: INNER_KEY_STORAGE_V3_ENCODING_HELPERS,
};

export const LATEST_KEY_STORAGE_VERSION = {
    outer: OuterKeyStorage_Version.V2_0,
    intermediate: IntermediateKeyStorage_Version.V1_1,
    inner: InnerKeyStorage_Version.V3_0,
};

/** Services required by the key storage factory. */
export type ServicesForKeyStorageFactory = Pick<
    ServicesForBackend,
    'crypto' | 'electron' | 'logging' | 'systemInfo'
>;

/**
 * Services required by the key storage.
 */
export type ServicesForKeyStorage = Pick<
    ServicesForBackend,
    'crypto' | 'electron' | 'logging' | 'systemInfo'
>;

export type KeyStorageRemoteSecretWriteData = RemoteSecretData & {
    readonly raw: RawRemoteSecret;
};

export type KeyStorageOnPremConfigStoreData =
    | Pick<
          NonNullable<LatestKeyStorageLayers['intermediate']['consumable']['onPremConfig']>,
          'oppfUrl' | 'oppfCachedConfig' | 'lastUpdated'
      >
    | undefined;
export type KeyStorageRemoteSecretDataStoreData =
    | (RemoteSecretData & {readonly initialTimeoutMs: u53})
    | undefined;
export type KeyStorageWorkCredentialsStoreData =
    | Pick<
          NonNullable<LatestKeyStorageLayers['intermediate']['consumable']['workCredentials']>,
          'password' | 'username'
      >
    | undefined;

/**
 * Stores and retrieves secret keys securely.
 */
export interface KeyStorage extends ProxyMarked {
    /**
     * Whether the inner key storage is encrypted using a Remote Secret. Always returns `false` in
     * builds that don't support Remote Secrets.
     *
     * @throws {KeyStorageError} If key storage is not initialized yet.
     */
    readonly isRemoteSecretEncrypted: boolean;

    /**
     * Returns the cached OnPrem config as a store.
     *
     * Note: The key storage does not need to be initialized before requesting this store. This
     * means it will contain `undefined` until the key storage is initialized.
     *
     * @throws {KeyStorageError} If called in an unsupported build flavor.
     */
    readonly onPremConfigStore: IQueryableStore<KeyStorageOnPremConfigStoreData>;

    /**
     * Returns the cached Remote Secret data (excluding the Remote Secret itself) as a store.
     *
     * Note: The key storage does not need to be initialized before requesting this store. This
     * means it will contain `undefined` until the key storage is initialized.
     *
     * @throws {KeyStorageError} If called in an unsupported build flavor or key storage is not
     * initialized yet.
     */
    readonly remoteSecretDataStore: IQueryableStore<KeyStorageRemoteSecretDataStoreData>;

    /**
     * Returns the cached Work credentials as a store.
     *
     * Note: The key storage does not need to be initialized before requesting this store. This
     * means it will contain `undefined` until the key storage is initialized.
     *
     * @throws {KeyStorageError} If called in an unsupported build flavor or key storage is not
     * initialized yet.
     */
    readonly workCredentialsStore: IQueryableStore<KeyStorageWorkCredentialsStoreData>;

    /**
     * Initialize the key storage instance from an existing key storage file on disk.
     *
     * Detects and reads any supported version of the key storage. If any layer is not at its latest
     * version, the key storage will be migrated to the latest format and written to disk.
     *
     * Important: `init` or `create` must be called once before any other methods can be used.
     *
     * @param password The local password to decrypt the key storage with.
     * @throws {KeyStorageError} If reading, validating or decrypting, or overriding the existing
     * key storage file fails.
     */
    readonly init: (password: string) => Promise<{
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
    }>;

    /**
     * Create the key storage file and write it to the file system. Throws an error if the key
     * storage file already exists.
     *
     * Important: `init` or `create` must be called once before any other methods can be used.
     *
     * @param password The local password to encrypt the key storage with.
     * @param contents Key storage contents to write to the file.
     * @param remoteSecretWriteData If provided, the inner key storage will be encrypted using
     *   Remote Secret.
     * @throws {KeyStorageError} If encrypting or writing the key storage fails, or the key storage
     *   file already exists.
     */
    readonly create: (
        password: string,
        contents: {
            readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
            readonly inner: LatestKeyStorageLayers['inner']['consumable'];
        },
        remoteSecretWriteData: KeyStorageRemoteSecretWriteData | undefined,
    ) => Promise<void>;

    /**
     * Read, decrypt and decode the key storage file and return its contents.
     *
     * @param password The local password to decrypt the intermediate key storage with.
     * @throws {KeyStorageError} If reading, decrypting, or validating the key storage fails, or
     *   it's not initialized yet.
     */
    readonly readContents: (password: string) => Promise<{
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
    }>;

    /**
     * Read, decrypt and decode the intermediate key storage contents only. Note: The inner key
     * storage will neither be decrypted nor returned.
     *
     * @param password The local password to decrypt the intermediate key storage with.
     * @throws {KeyStorageError} If reading, decrypting, or validating the key storage fails, or
     *   it's not initialized yet.
     */
    readonly readIntermediateContents: (
        password: string,
    ) => Promise<LatestKeyStorageLayers['intermediate']['consumable']>;

    /**
     * Update the OnPrem configuration stored in the key storage.
     *
     * @param password The local password to decrypt and encrypt the intermediate key storage with.
     * @param onPremConfig The OnPrem config to set, or `undefined` to remove it.
     * @throws {KeyStorageError} If any operation fails during the update.
     */
    readonly setOnPremConfig: (
        password: string,
        onPremConfig: KeyStorageOnPremConfigStoreData,
    ) => Promise<void>;

    /**
     * Update the key storage password.
     *
     * @param currentPassword The local password to decrypt the intermediate key storage with.
     * @param newPassword The new local password to encrypt the intermediate key storage with.
     * @throws {KeyStorageError} If any operation fails during the update.
     */
    readonly setPassword: (currentPassword: string, newPassword: string) => Promise<void>;

    /**
     * Re-encrypt the inner key storage with a (new) Remote Secret, or disable
     * Remote-Secret-encryption.
     *
     * @param password The local password to decrypt and encrypt the intermediate key storage with.
     * @param remoteSecretWriteData Remote Secret details for encrypting the inner key storage.
     * @throws {KeyStorageError} If any operation fails during the update.
     */
    readonly setRemoteSecret: (
        password: string,
        remoteSecretWriteData: KeyStorageRemoteSecretWriteData | undefined,
    ) => Promise<void>;

    /**
     * Update the Threema Work credentials stored in the key storage.
     *
     * @param password The local password to decrypt and encrypt the intermediate key storage with.
     * @param workCredentials The Work credentials to set, or `undefined` to remove it.
     * @throws {KeyStorageError} If any operation fails during the update.
     */
    readonly setWorkCredentials: (
        password: string,
        workCredentials: ThreemaWorkCredentials,
    ) => Promise<void>;
}
