import * as v from '@badrap/valita';

import type {ServicesForBackend} from '~/common/backend';
import {ensureEncryptedDataWithNonceAhead} from '~/common/crypto';
import {wrapRawDatabaseKey} from '~/common/db';
import type {ThreemaWorkCredentials, ThreemaWorkData} from '~/common/device';
import {TransferTag} from '~/common/enum';
import {BaseError, type BaseErrorOptions} from '~/common/error';
import {TRANSFER_HANDLER} from '~/common/index';
import {OuterKeyStorageV2_Argon2idParameters_Argon2Version} from '~/common/internal-protobuf/key-storage-file';
import {
    ensureBaseUrl,
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureRemoteSecretAuthenticationToken,
    ensureRemoteSecretHash,
    ensureServerGroup,
    type RawRemoteSecret,
    type RemoteSecretData,
} from '~/common/network/types';
import {wrapRawClientKey, wrapRawDeviceGroupKey} from '~/common/network/types/keys';
import {KiB, MiB, type u8, type u53, type u16} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import {type ProxyMarked, registerErrorTransferHandler} from '~/common/utils/endpoint';
import type {IQueryableStore} from '~/common/utils/store';
import {instanceOf, unsignedLongAsU64} from '~/common/utils/valita-helpers';

/**
 * Specify the target runtime for the KDF, as well as upper and
 * lower bounds for generating warnings (if the KDF runs slower or faster).
 */
export const KDF_TARGET_RUNTIME_MS = {
    min: 1000,
    target: 2000,
    max: 3000,
} as const;

/**
 * Argon2 minimal parameters.
 *
 * There are always two sets of parameters: The absolute minimum (validated when
 * reading a key storage) and the current minimum (used when generating a new
 * key storage).
 *
 * The minimal parameters aim to provide reasonable security even against GPU
 * based attacks, but may be increased in difficulty using a benchmark (see
 * {@link FileKeyStorage._determineKdfParams}). On old or very weak hardware these
 * parameters may exceed our goal of 2 seconds, but should still be usable (the
 * KDF will run every time the application is opened).
 *
 * To test this with the `argon2` command line program:
 *
 *     echo "pw" | argon2 asdfjklo -id -v 13 -t 3 -k $((1024*128)) -p 1
 *
 * With these parameters, the following runtimes on desktop / server hardware
 * are achieved:
 *
 * - AMD Ryzen 9 5900X: 0.207 s
 * - Intel Xeon 6140:   0.748 s
 * - Intel Atom D525:   3.526 s
 *
 * For comparison, here are some smartphones (tested with the argon2kt app):
 *
 * - Snapdragon 835 (Xiaomi Mi 6): 0.584 s
 * - Snapdragon 670 (Pixel 3a):    0.618 s
 * - Snapdragon 400 (Moto G):      4.875 s
 * - MediaTek 6589M (Fairphone 1): 3.431 s
 *
 * And on ARM based SBCs:
 *
 * - Raspberry Pi Zero W: 6.473 s
 */
export interface Argon2MinParams {
    readonly saltLengthBytes: u53;
    readonly memoryBytes: u53;
    readonly iterations: u53;
    readonly parallelism: u53;
}
export const ARGON2_MIN_PARAMS = {
    accept: {
        saltLengthBytes: 16,
        memoryBytes: 128 * MiB,
        iterations: 3,
        parallelism: 1,
    },
    create: {
        saltLengthBytes: 16,
        memoryBytes: 128 * MiB,
        iterations: 3,
        parallelism: 1,
    },
} as const satisfies {
    readonly accept: Argon2MinParams;
    readonly create: Argon2MinParams;
};

/**
 * The Argon2 version wrapper.
 *
 * Right now, only version 1.3 (0x13) is supported.
 */
export class Argon2Version {
    private constructor(private readonly _versionByte: 0x13) {}

    /**
     * Create an {@link Argon2Version} instance from an argon2 compatible version byte.
     */
    public static fromArgon2VersionByte(hexVersionByte: 0x13): Argon2Version {
        return new Argon2Version(hexVersionByte);
    }

    /**
     * Create an {@link Argon2Version} instance from a protobuf
     * {@link OuterKeyStorageV2_Argon2idParameters} instance.
     *
     * @throws {Error} In case of an unsupported Argon2 version.
     */
    public static fromProtobuf(version: u16): Argon2Version {
        switch (version) {
            case OuterKeyStorageV2_Argon2idParameters_Argon2Version.VERSION_1_3:
                return new Argon2Version(0x13);
            case OuterKeyStorageV2_Argon2idParameters_Argon2Version.UNRECOGNIZED:
            default:
                throw new Error(`Unrecognized Argon2 version in protobuf data`);
        }
    }

    /**
     * Return the version as supported by the `argon2` library.
     */
    public toArgon2VersionByte(): u8 {
        return this._versionByte;
    }

    /**
     * Return the version as {@link OuterKeyStorageV2_Argon2idParameters}.
     */
    public toProtobuf(): OuterKeyStorageV2_Argon2idParameters_Argon2Version {
        switch (this._versionByte) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            case 0x13:
                return OuterKeyStorageV2_Argon2idParameters_Argon2Version.VERSION_1_3;
            default:
                return unreachable(this._versionByte);
        }
    }
}

/**
 * Validation schema for the Argon2id parameters in the encrypted key storage file contents.
 *
 * @throws {ValitaError} In case validation fails.
 */
const ARGON2ID_PARAMETERS_SCHEMA = v
    .object({
        // Argon implementation version
        version: v.number().map((version) => Argon2Version.fromProtobuf(version)),
        // Random salt
        salt: instanceOf(Uint8Array).assert(
            (salt) => salt.byteLength >= ARGON2_MIN_PARAMS.accept.saltLengthBytes,
            `Argon2id salt must be ≥ ${ARGON2_MIN_PARAMS.accept.saltLengthBytes} bytes`,
        ),
        // Memory usage in bytes
        memoryBytes: v
            .number()
            .assert(
                (memoryBytes) => memoryBytes >= import.meta.env.ARGON2_MIN_MEMORY_BYTES,
                `Argon2id memoryBytes must be ≥ ${Math.round(
                    import.meta.env.ARGON2_MIN_MEMORY_BYTES / KiB,
                )} KiB`,
            ),
        // Number of iterations
        iterations: v
            .number()
            .assert(
                (iterations) => iterations >= ARGON2_MIN_PARAMS.accept.iterations,
                `Argon2id iterations must be ≥ ${ARGON2_MIN_PARAMS.accept.iterations}`,
            ),
        // Amount of parallelism
        parallelism: v
            .number()
            .assert(
                (parallelism) => parallelism >= ARGON2_MIN_PARAMS.accept.parallelism,
                `Argon2id parallelism must be ≥ ${ARGON2_MIN_PARAMS.accept.parallelism}`,
            ),
    })
    .rest(v.unknown());
/**
 * Validated Argon2id parameters.
 */
export type Argon2idParameters = Readonly<v.Infer<typeof ARGON2ID_PARAMETERS_SCHEMA>>;

/**
 * Validation schema for the deprecated outer key storage file contents.
 *
 * @deprecated Should only be used for one-time migration from V1 to V2.
 * @throws {KeyStorageError} In case of invalid Argon2 parameters.
 * @throws {ValitaError} In case validation fails.
 */
export const OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1 = v
    .object({
        // Current schema version
        schemaVersion: v.literal(1),

        // Encrypted key storage bytes
        encryptedKeyStorage: instanceOf(Uint8Array).map(ensureEncryptedDataWithNonceAhead),

        // Encryption parameters
        kdfParameters: v.object({
            $case: v.literal('argon2id'),
            argon2id: ARGON2ID_PARAMETERS_SCHEMA,
        }),
    })
    .rest(v.unknown());

/**
 * Validation schema for the outer key storage file contents.
 *
 * @throws {KeyStorageError} In case of invalid Argon2 parameters.
 * @throws {ValitaError} In case validation fails.
 */
export const OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2 = v
    .object({
        // Encrypted key storage bytes
        encryptedIntermediate: instanceOf(Uint8Array).map(ensureEncryptedDataWithNonceAhead),

        // Encryption parameters
        kdfParameters: v
            .object({
                $case: v.literal('argon2id'),
                argon2id: ARGON2ID_PARAMETERS_SCHEMA,
            })
            .rest(v.unknown()),
    })
    .rest(v.unknown());

/**
 * Validated outer key storage file contents.
 *
 * @deprecated Should only be used for one-time migration from V1 to V2.
 */
export type OuterKeyStorageFileContentsV1 = Readonly<
    v.Infer<typeof OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1>
>;

/**
 * Validated outer key storage file contents.
 */
export type OuterKeyStorageFileContentsV2 = Readonly<
    v.Infer<typeof OUTER_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V2>
>;

export const INTERMEDIATE_KEY_STORAGE_RS_PROTECTED_SCHEMA = v.object({
    remoteSecretAuthenticationToken: instanceOf(Uint8Array).map(
        ensureRemoteSecretAuthenticationToken,
    ),
    remoteSecretHash: instanceOf(Uint8Array).map(ensureRemoteSecretHash),
    onPremCachedRemoteSecretEndpointUrl: v.string().map((url) => ensureBaseUrl(url, 'https:')),
    encryptedInner: instanceOf(Uint8Array).map(ensureEncryptedDataWithNonceAhead),
});

export type IntermediateKeyStorageRsProtectedContents = Readonly<
    v.Infer<typeof INTERMEDIATE_KEY_STORAGE_RS_PROTECTED_SCHEMA>
>;

/**
 * Validated key storage config for OnPrem.
 */
const KEY_STORAGE_ONPREM_CONFIG = v
    .object({
        oppfUrl: v.string(),
        oppfCachedConfig: v.string(),
        lastUpdated: unsignedLongAsU64(),
    })
    .rest(v.unknown());

export const INTERMEDIATE_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1 = v
    .object({
        inner: v.union(
            v
                .object({
                    $case: v.literal('plaintextInner'),
                    plaintextInner: instanceOf(Uint8Array),
                })
                .rest(v.unknown()),
            v
                .object({
                    $case: v.literal('remoteSecretProtectedInner'),
                    remoteSecretProtectedInner: INTERMEDIATE_KEY_STORAGE_RS_PROTECTED_SCHEMA,
                })
                .rest(v.unknown()),
        ),
        workCredentials: v
            .object({username: v.string(), password: v.string()})
            .rest(v.unknown())
            .optional(),
        onPremConfig: KEY_STORAGE_ONPREM_CONFIG.optional(),
    })
    .rest(v.unknown());

/**
 * Validated intermediate key storage file contents.
 */
export type IntermediateKeyStorageFileContentsV1 = Readonly<
    v.Infer<typeof INTERMEDIATE_KEY_STORAGE_FILE_CONTENTS_SCHEMA_V1>
>;

/**
 * Validation schema for the inner key storage contents.
 *
 * Note: It's important that all objects are annotated with `.rest(v.unknown())` to ensure forwards
 * compatibility!
 *
 * @deprecated Should only be used for one-time migration from V1 to V2.
 * @throws {ValitaError} In case validation fails.
 */
export const INNER_KEY_STORAGE_SCHEMA_V1 = v
    .object({
        // Current schema version
        schemaVersion: v.literal(2),

        // Identity related information
        identityData: v
            .object({
                identity: v.string().map(ensureIdentityString),
                ck: instanceOf(Uint8Array).map(wrapRawClientKey),
                serverGroup: v.string().map(ensureServerGroup),
            })
            .rest(v.unknown()),
        dgk: instanceOf(Uint8Array).map(wrapRawDeviceGroupKey),
        databaseKey: instanceOf(Uint8Array).map(wrapRawDatabaseKey),
        deviceIds: v
            .object({
                d2mDeviceId: unsignedLongAsU64().map(ensureD2mDeviceId),
                cspDeviceId: unsignedLongAsU64().map(ensureCspDeviceId),
            })
            .rest(v.unknown()),
        deviceCookie: instanceOf(Uint8Array).map(ensureDeviceCookie),
        workCredentials: v
            .object({username: v.string(), password: v.string()})
            .rest(v.unknown())
            .optional(),
        onPremConfig: KEY_STORAGE_ONPREM_CONFIG.optional(),
    })
    .rest(v.unknown());

/**
 * Validation schema for the inner key storage contents.
 *
 * Note: It's important that all objects are annotated with `.rest(v.unknown())` to ensure forwards
 * compatibility!
 *
 * @throws {ValitaError} In case validation fails.
 */
export const INNER_KEY_STORAGE_SCHEMA_V2 = v
    .object({
        // Identity related information
        identityData: v
            .object({
                identity: v.string().map(ensureIdentityString),
                ck: instanceOf(Uint8Array).map(wrapRawClientKey),
                serverGroup: v.string().map(ensureServerGroup),
            })
            .rest(v.unknown()),
        dgk: instanceOf(Uint8Array).map(wrapRawDeviceGroupKey),
        databaseKey: instanceOf(Uint8Array).map(wrapRawDatabaseKey),
        deviceIds: v
            .object({
                d2mDeviceId: unsignedLongAsU64().map(ensureD2mDeviceId),
                cspDeviceId: unsignedLongAsU64().map(ensureCspDeviceId),
            })
            .rest(v.unknown()),
        deviceCookie: instanceOf(Uint8Array).map(ensureDeviceCookie),
    })
    .rest(v.unknown());

/**
 * Validated inner key storage contents.
 *
 * @deprecated Should only be used for one-time migration from V1 to V2.
 * @throws {ValitaError} In case validation fails.
 */
export type InnerKeyStorageFileContentsV1 = Readonly<v.Infer<typeof INNER_KEY_STORAGE_SCHEMA_V1>>;

/**
 * Validated inner key storage contents.
 *
 * @throws {ValitaError} In case validation fails.
 */
export type InnerKeyStorageFileContentsV2 = Readonly<v.Infer<typeof INNER_KEY_STORAGE_SCHEMA_V2>>;

// Decrypted key storage contents by layer.

/**
 * Decrypted and validated inner key storage contents, isolated to only include known data from the
 * inner key storage layer (i.e., no data from the intermediate or outer key storage layers).
 */
export type DecryptedInnerKeyStorageContents = Pick<
    InnerKeyStorageFileContentsV2,
    'databaseKey' | 'deviceCookie' | 'deviceIds' | 'dgk' | 'identityData'
> &
    Readonly<Record<string, unknown>>;

/**
 * Decrypted and validated intermediate key storage contents, isolated to only include known data
 * from the intermediate key storage layer (i.e., no data from the inner or outer key storage
 * layers).
 */
export type DecryptedIntermediateKeyStorageContents = Pick<
    IntermediateKeyStorageFileContentsV1,
    'onPremConfig' | 'workCredentials'
> &
    Readonly<Record<string, unknown>>;

/**
 * Decrypted and validated key storage contents of all layers.
 */
export interface DecryptedKeyStorageContents {
    readonly intermediateContents: DecryptedIntermediateKeyStorageContents & {
        readonly innerContents: DecryptedInnerKeyStorageContents;
    };
}

/**
 * Validated key storage OPPF config.
 */
export type KeyStorageOnPremConfig = v.Infer<typeof KEY_STORAGE_ONPREM_CONFIG>;

/** Services required by the key storage factory. */
export type ServicesForKeyStorageFactory = Pick<
    ServicesForBackend,
    'crypto' | 'electron' | 'logging' | 'systemInfo'
>;

/** Services required by the key storage. */
export type ServicesForKeyStorage = Pick<
    ServicesForBackend,
    'crypto' | 'electron' | 'logging' | 'systemInfo'
>;

export type OnPremConfigStoreData = KeyStorageOnPremConfig | undefined;
export type RemoteSecretWriteData = RemoteSecretData & {readonly key: RawRemoteSecret};
export type RemoteSecretStoreData =
    | (RemoteSecretData & {readonly initialTimeoutMs: u53})
    | undefined;
export type WorkDataStoreData = ThreemaWorkData | undefined;

/**
 * Stores and retrieves secret keys securely.
 */
export interface KeyStorage extends ProxyMarked {
    /**
     * Cached OnPrem config (OPPF data). Important: Contains `undefined` if the key storage has not
     * been read from or written to before at least once.
     *
     * @throws If accessed from a non-OnPrem build or is not initialized yet.
     */
    readonly onPremConfig: IQueryableStore<OnPremConfigStoreData>;

    /**
     * Cached parameters for retrieving the remote secret. Important: Contains `undefined` if the
     * key storage has not been read from or written to before at least once.
     *
     * @throws If accessed from a non-Work or -OnPrem build or is not initialized yet.
     */
    readonly remoteSecretData: IQueryableStore<RemoteSecretStoreData>;

    /**
     * Cached Threema Work data (i.e., Work credentials). Important: Contains `undefined` if the key
     * storage has not been read from or written to before at least once.
     *
     * @throws If accessed from a non-Work or -OnPrem build or is not initialized yet.
     */
    readonly workData: IQueryableStore<WorkDataStoreData>;

    /**
     * Create the key storage file and write it to the file system, or override the file if it
     * already exists.
     *
     * @param password The local password to encrypt the key storage with.
     * @param contents Key storage contents to write to the file.
     * @param remoteSecretData If provided, the inner key storage will be encrypted using RS.
     * @throws {KeyStorageError} If encrypting or writing the key storage fails.
     */
    readonly createOrOverride: (
        password: string,
        contents: Pick<DecryptedKeyStorageContents, 'intermediateContents'>,
        remoteSecretData: RemoteSecretWriteData | undefined,
    ) => Promise<void>;

    /**
     * Read, decrypt and decode the key storage file in the file system and return its contents.
     *
     * @throws {KeyStorageError} If reading, validating or decrypting the key storage fails.
     */
    readonly readContents: (password: string) => Promise<DecryptedKeyStorageContents>;

    /**
     * Read, decrypt and decode the intermediate key storage contents only. Note: The inner key
     * storage will neither be decrypted nor returned.
     *
     * @throws {KeyStorageError} If reading, validating or decrypting the key storage fails.
     */
    readonly readIntermediateContents: (
        password: string,
    ) => Promise<
        DecryptedIntermediateKeyStorageContents & {readonly isRemoteSecretActive: boolean}
    >;

    /**
     * Update the key storage password.
     *
     * @throws {KeyStorageError} If encrypting or writing the key storage fails.
     */
    readonly updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;

    /**
     * Update the Threema Work credentials stored in the key storage.
     *
     * @throws {KeyStorageError} If encrypting or writing the key storage fails.
     */
    readonly updateWorkCredentials: (
        password: string,
        workCredentials: ThreemaWorkCredentials,
    ) => Promise<void>;

    /**
     * Update the OnPrem configuration stored in the key storage.
     *
     * @throws {KeyStorageError} If encrypting or writing the key storage fails.
     */
    readonly updateOnPremConfig: (
        password: string,
        onPremConfig: KeyStorageOnPremConfig,
    ) => Promise<void>;
}

/**
 * Type of the {@link KeyStorageError}.
 *
 * - not-found: Key storage or key storage directory cannot be found.
 * - not-readable: Key storage is not readable.
 * - not-writable: Key storage is not writable.
 * - malformed: Key storage is malformed (e.g. non-protobuf contents).
 * - undecryptable: Key storage cannot be decrypted.
 * - invalid: Key storage validation fails after decrypting / decoding.
 * - migration-error: The migration of the key storage to a new version failed.
 * - internal-error: An internal error occurred during loading or writing of the key storage.
 */
export type KeyStorageErrorType =
    | 'not-found'
    | 'not-readable'
    | 'not-writable'
    | 'malformed'
    | 'undecryptable'
    | 'invalid'
    | 'migration-error'
    | 'internal-error';

const KEY_STORAGE_ERROR_TRANSFER_HANDLER = registerErrorTransferHandler<
    KeyStorageError,
    TransferTag.KEY_STORAGE_ERROR,
    [type: KeyStorageErrorType]
>({
    tag: TransferTag.KEY_STORAGE_ERROR,
    serialize: (error) => [error.type],
    deserialize: (message, cause, [type]) => new KeyStorageError(type, message, {from: cause}),
});

/**
 * Errors related to reading, decrypting and decoding a {@link KeyStorage}.
 */
export class KeyStorageError extends BaseError {
    public [TRANSFER_HANDLER] = KEY_STORAGE_ERROR_TRANSFER_HANDLER;

    public constructor(
        public readonly type: KeyStorageErrorType,
        message: string,
        options?: BaseErrorOptions,
    ) {
        super(message, options);
    }
}
