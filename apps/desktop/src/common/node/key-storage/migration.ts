/**
 * Version-aware migration logic for key storage layers. Able to read legacy layers and convert to
 * them to the latest format.
 */

import type {u53} from '@threema/ts-utils/integer/u53';
import {bytesLeToU16} from '@threema/ts-utils/number/bytes-le-to-u16';

import type {EncryptedDataWithNonceAhead} from '~/common/crypto';
import {
    InnerKeyStorage_Version,
    IntermediateKeyStorage_Version,
    OuterKeyStorage_Version,
} from '~/common/internal-protobuf/key-storage-file';
import {
    LATEST_KEY_STORAGE_VERSION,
    type KeyStorageIntermediateDecodeHandler,
    type KeyStorageRemoteSecretDataStoreData,
    type KeyStorageRemoteSecretWriteData,
    type LatestKeyStorageLayers,
    type ServicesForKeyStorage,
} from '~/common/key-storage';
import {KeyStorageError} from '~/common/key-storage/common';
import {
    INNER_KEY_STORAGE_V1_ENCODING_HELPERS,
    type DecryptedEncodedInnerKeyStorageV1Bytes,
} from '~/common/key-storage/layers/inner/v1';
import {
    INNER_KEY_STORAGE_V2_ENCODING_HELPERS,
    type DecryptedEncodedInnerKeyStorageV2Bytes,
} from '~/common/key-storage/layers/inner/v2';
import {
    INNER_KEY_STORAGE_V3_ENCODING_HELPERS,
    type DecryptedEncodedInnerKeyStorageV3Bytes,
} from '~/common/key-storage/layers/inner/v3';
import {
    INTERMEDIATE_KEY_STORAGE_V1_ENCODING_HELPERS,
    type DecryptedEncodedIntermediateKeyStorageV1Bytes,
} from '~/common/key-storage/layers/intermediate/v1';
import {
    INTERMEDIATE_KEY_STORAGE_V1_1_ENCODING_HELPERS,
    type DecryptedEncodedIntermediateKeyStorageV1_1Bytes,
} from '~/common/key-storage/layers/intermediate/v1_1';
import {
    OUTER_KEY_STORAGE_V1_ENCODING_HELPERS,
    type EncodedOuterKeyStorageV1Bytes,
} from '~/common/key-storage/layers/outer/v1';
import {
    OUTER_KEY_STORAGE_V2_ENCODING_HELPERS,
    type EncodedOuterKeyStorageV2Bytes,
} from '~/common/key-storage/layers/outer/v2';
import {RemoteSecretApplicationStartMonitorTask} from '~/common/network/protocol/task/libthreema/remote-secret-monitor';
import type {RemoteSecretData} from '~/common/network/types';
import {
    encodeAndEncryptLatestInnerKeyStorage,
    encodeAndEncryptLatestIntermediateKeyStorage,
    encodeLatestOuterKeyStorage,
} from '~/common/node/key-storage/helpers';
import {MiB} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import {pick} from '~/common/utils/object';

import {decryptPasswordBased, decryptRemoteSecretBased} from './crypto';

const RESTORATION_MAX_ARGON2_MEMORY_BYTES: u53 = 512 * MiB;
const RESTORATION_MAX_ARGON2_WORK_MIB_ITERATIONS: u53 = 4096;
const RESTORATION_MAX_ARGON2_PARALLELISM: u53 = 4;

function validateRestorationKdfParameters(
    parameters: LatestKeyStorageLayers['outer']['validated']['kdfParameters']['argon2id'],
): void {
    if (
        parameters.memoryBytes > RESTORATION_MAX_ARGON2_MEMORY_BYTES ||
        (parameters.memoryBytes / MiB) * parameters.iterations >
            RESTORATION_MAX_ARGON2_WORK_MIB_ITERATIONS ||
        parameters.parallelism > RESTORATION_MAX_ARGON2_PARALLELISM
    ) {
        throw new KeyStorageError(
            'invalid',
            'Archived key storage KDF parameters exceed safe limits',
        );
    }
}

/**
 * Read a deprecated key storage file (OuterKeyStorageV1 + InnerKeyStorageV1, no intermediate
 * layer), and transform the contained data into the latest key storage structure.
 *
 * - `consumable`: Consumable data of the fully decrypted and decoded key storage in the latest
 *   format, by layer.
 * - `encoded`: The re-encoded key storage after migrating it to the latest format.
 * - `isMigrated`: Whether any layers were migrated. Always true in the case of a deprecated key
 *   storage file.
 *
 * @param deprecatedFileBytes Raw bytes read from the deprecated key storage file.
 * @param password The local password to decrypt the key storage with.
 * @param services Services required for decryption.
 * @param onIntermediateDecoded Optional callback invoked once the latest-format intermediate data
 *   has been derived from the legacy file.
 * @throws {KeyStorageError} If any step of the migration fails.
 */
/* eslint-disable @typescript-eslint/no-deprecated */
export async function migrateFromDeprecatedKeyStorageFileBytes(
    deprecatedFileBytes: Uint8Array,
    password: string,
    services: Pick<ServicesForKeyStorage, 'crypto' | 'logging'>,
    onIntermediateDecoded?: KeyStorageIntermediateDecodeHandler,
    readOnly: boolean = false,
): Promise<{
    readonly consumable: {
        readonly outer: LatestKeyStorageLayers['outer']['consumable'];
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
    };
    readonly encoded: LatestKeyStorageLayers['outer']['encoded'];
    readonly isMigrated: true;
}> {
    const outerKeyStorageBytes = deprecatedFileBytes as EncodedOuterKeyStorageV1Bytes;

    // Outer: Decode and validate.
    const decodedOuter =
        OUTER_KEY_STORAGE_V1_ENCODING_HELPERS.encodedToDecoded(outerKeyStorageBytes);
    const validatedOuter = OUTER_KEY_STORAGE_V1_ENCODING_HELPERS.decodedToValidated(decodedOuter);
    if (readOnly) {
        validateRestorationKdfParameters(validatedOuter.kdfParameters.argon2id);
    }

    // Inner: Decrypt, decode, and validate.
    const decryptedInner = (await decryptPasswordBased(
        validatedOuter.encryptedKeyStorage,
        {password, params: validatedOuter.kdfParameters.argon2id},
        services,
    )) as unknown as DecryptedEncodedInnerKeyStorageV1Bytes;
    const decodedInner = INNER_KEY_STORAGE_V1_ENCODING_HELPERS.encodedToDecoded(decryptedInner);
    const validatedInner = INNER_KEY_STORAGE_V1_ENCODING_HELPERS.decodedToValidated(decodedInner);

    // Transform data to conform to the latest layers.
    const latestOuterValidated: Pick<
        LatestKeyStorageLayers['outer']['validated'],
        'kdfParameters'
    > = {
        kdfParameters: validatedOuter.kdfParameters,
    };
    const latestIntermediateValidated: Pick<
        LatestKeyStorageLayers['intermediate']['validated'],
        'onPremConfig' | 'workCredentials'
    > = {
        workCredentials: validatedInner.workCredentials,
        onPremConfig:
            validatedInner.onPremConfig === undefined
                ? undefined
                : {...validatedInner.onPremConfig, oppfCachedConfigIsFallback: false},
    };
    const latestInnerValidated: LatestKeyStorageLayers['inner']['validated'] = pick(
        validatedInner,
        ['identityData', 'dgk', 'databaseKey', 'deviceIds', 'deviceCookie'] as const,
    );

    // Notify the caller that the intermediate data is available. Legacy key storages can never be
    // Remote-Secret-encrypted.
    await onIntermediateDecoded?.({
        intermediate: latestIntermediateValidated,
        isInnerRemoteSecretProtected: false,
    });

    // Archived restoration only needs decoded contents. Do not make it depend on successfully
    // re-encrypting a migration that must never be written back to the archived source.
    let migratedOuter: LatestKeyStorageLayers['outer']['encoded'];
    if (readOnly) {
        migratedOuter = deprecatedFileBytes as LatestKeyStorageLayers['outer']['encoded'];
    } else {
        const migratedIntermediateInner = encodeAndEncryptLatestInnerKeyStorage(
            latestInnerValidated,
            // Legacy key storage can never be Remote-Secret-encrypted.
            undefined,
            services,
        );
        const migratedIntermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
            migratedIntermediateInner,
            latestIntermediateValidated,
            {
                password,
                params: latestOuterValidated.kdfParameters.argon2id,
            },
            services,
        );
        migratedOuter = encodeLatestOuterKeyStorage(migratedIntermediate, latestOuterValidated);
    }

    return {
        consumable: {
            outer: latestOuterValidated,
            intermediate: latestIntermediateValidated,
            inner: latestInnerValidated,
        },
        encoded: migratedOuter,
        isMigrated: true,
    };
}
/* eslint-enable @typescript-eslint/no-deprecated */

/**
 * Read a non-reprecated key storage file, and transform the contained data into the latest key
 * storage structure if necessary. Returns an object containing:
 *
 * - `consumable`: Consumable data of the fully decrypted and decoded key storage in the latest
 *   format, by layer.
 * - `encoded`: The (re-)encoded key storage after migrating it to the latest format, or the
 *   unchanged bytes if all layers were already at the latest versions.
 * - `initialRemoteSecretStoreData`: The initial data used for or yielded by the
 *   `RemoteSecretApplicationStartMonitorTask`, if the inner key storage is Remote-Secret-encrypted.
 * - `isMigrated`: Whether any layers were migrated or trusted initialization overrides required
 *   re-encoding.
 *
 * @param fileBytes Raw bytes read from the key storage file.
 * @param password The local password to decrypt the key storage with.
 * @param services Services required for decryption.
 * @param onIntermediateDecoded Optional callback invoked after the intermediate layer has been
 *   decoded but before the inner layer is decrypted.
 */
export async function readOrMigrateFromKeyStorageFileBytes(
    fileBytes: Uint8Array,
    password: string,
    services: Pick<ServicesForKeyStorage, 'crypto' | 'electron' | 'logging' | 'systemInfo'>,
    onIntermediateDecoded?: KeyStorageIntermediateDecodeHandler,
    readOnly: boolean = false,
): Promise<{
    readonly consumable: {
        readonly outer: LatestKeyStorageLayers['outer']['consumable'];
        readonly intermediate: LatestKeyStorageLayers['intermediate']['consumable'];
        readonly inner: LatestKeyStorageLayers['inner']['consumable'];
    };
    readonly encoded: LatestKeyStorageLayers['outer']['encoded'];
    readonly initialRemoteSecretStoreData: KeyStorageRemoteSecretDataStoreData;
    readonly isMigrated: boolean;
}> {
    let latestOuterValidated: Pick<LatestKeyStorageLayers['outer']['validated'], 'kdfParameters'>;
    let latestIntermediateValidated: Pick<
        LatestKeyStorageLayers['intermediate']['validated'],
        'onPremConfig' | 'workCredentials'
    > = {};
    let latestInnerValidated: LatestKeyStorageLayers['inner']['validated'];

    // Outer: Determine version and decode.
    const outerVersion = bytesLeToU16(fileBytes.subarray(0, 2)) as OuterKeyStorage_Version;
    let encryptedIntermediate: EncryptedDataWithNonceAhead;
    switch (outerVersion) {
        case OuterKeyStorage_Version.V1_0:
            throw new KeyStorageError(
                'malformed',
                'Found legacy outer key storage inside non-legacy key storage file',
            );

        // Latest outer key storage version.
        case OuterKeyStorage_Version.V2_0: {
            const decoded = OUTER_KEY_STORAGE_V2_ENCODING_HELPERS.encodedToDecoded(
                fileBytes as unknown as EncodedOuterKeyStorageV2Bytes,
            );
            const validated = OUTER_KEY_STORAGE_V2_ENCODING_HELPERS.decodedToValidated(decoded);

            // Since this is already at the latest version, assign the contents directly.
            latestOuterValidated = pick(validated, ['kdfParameters'] as const);
            // Assign encrypted inner as-is for the next step.
            encryptedIntermediate = validated.encryptedIntermediate;
            break;
        }

        case OuterKeyStorage_Version.UNRECOGNIZED:
            throw new KeyStorageError(
                'malformed',
                `Encountered unrecognized outer key storage version: ${outerVersion}`,
            );

        default:
            unreachable(
                outerVersion,
                new KeyStorageError(
                    'malformed',
                    `Encountered unknown outer key storage version: ${outerVersion}`,
                ),
            );
    }

    if (readOnly) {
        validateRestorationKdfParameters(latestOuterValidated.kdfParameters.argon2id);
    }

    // Intermediate: Decrypt, determine version, and decode.
    const decryptedIntermediate = await decryptPasswordBased(
        encryptedIntermediate,
        {
            password,
            params: latestOuterValidated.kdfParameters.argon2id,
        },
        services,
    );
    const intermediateVersion = bytesLeToU16(
        decryptedIntermediate.subarray(0, 2),
    ) as IntermediateKeyStorage_Version;
    let intermediateInner: LatestKeyStorageLayers['intermediate']['validated']['inner'];
    switch (intermediateVersion) {
        case IntermediateKeyStorage_Version.V1_0: {
            /* eslint-disable @typescript-eslint/no-deprecated */
            const decoded = INTERMEDIATE_KEY_STORAGE_V1_ENCODING_HELPERS.encodedToDecoded(
                decryptedIntermediate as unknown as DecryptedEncodedIntermediateKeyStorageV1Bytes,
            );
            const validated =
                INTERMEDIATE_KEY_STORAGE_V1_ENCODING_HELPERS.decodedToValidated(decoded);
            /* eslint-enable @typescript-eslint/no-deprecated */

            // Assign encrypted inner as-is for the next step.
            intermediateInner = validated.inner;
            break;
        }

        // Latest intermediate key storage version.
        case IntermediateKeyStorage_Version.V1_1: {
            const decoded = INTERMEDIATE_KEY_STORAGE_V1_1_ENCODING_HELPERS.encodedToDecoded(
                decryptedIntermediate as unknown as DecryptedEncodedIntermediateKeyStorageV1_1Bytes,
            );
            const validated =
                INTERMEDIATE_KEY_STORAGE_V1_1_ENCODING_HELPERS.decodedToValidated(decoded);

            // Since this is already at the latest version, assign the contents directly.
            latestIntermediateValidated = pick(validated, [
                'onPremConfig',
                'workCredentials',
            ] as const);
            // Assign encrypted inner as-is for the next step.
            intermediateInner = validated.inner;
            break;
        }

        case IntermediateKeyStorage_Version.UNRECOGNIZED:
            throw new KeyStorageError(
                'malformed',
                `Encountered unrecognized intermediate key storage version: ${intermediateVersion}`,
            );

        default:
            unreachable(
                intermediateVersion,
                new KeyStorageError(
                    'malformed',
                    `Encountered unknown intermediate key storage version: ${intermediateVersion}`,
                ),
            );
    }

    // Now that the intermediate key storage has been decoded, execute the callback with the
    // obtained data.
    const initOverridesResult = await onIntermediateDecoded?.({
        intermediate: latestIntermediateValidated,
        isInnerRemoteSecretProtected: intermediateInner.$case === 'remoteSecretProtectedInner',
    });
    const remoteSecretEndpointOverride =
        initOverridesResult === undefined ? undefined : initOverridesResult.remoteSecretEndpoint;
    const remoteSecretRetrieval = initOverridesResult?.remoteSecretRetrieval;

    // If `intermediateInner` is Remote-Secret-protected, decrypt it first.
    let encodedInner: Uint8Array;
    let initialRemoteSecretData:
        | (KeyStorageRemoteSecretWriteData & KeyStorageRemoteSecretDataStoreData)
        | undefined;
    let remoteSecretEndpointChanged = false;
    switch (intermediateInner.$case) {
        case 'plaintextInner':
            encodedInner = intermediateInner.plaintextInner;
            break;

        case 'remoteSecretProtectedInner': {
            const cachedEndpoint =
                intermediateInner.remoteSecretProtectedInner.onPremCachedRemoteSecretEndpointUrl;
            const endpoint = remoteSecretEndpointOverride ?? cachedEndpoint;
            remoteSecretEndpointChanged = endpoint.toString() !== cachedEndpoint.toString();
            const remoteSecretData: RemoteSecretData = {
                endpoint,
                hash: intermediateInner.remoteSecretProtectedInner.remoteSecretHash,
                token: intermediateInner.remoteSecretProtectedInner.remoteSecretAuthenticationToken,
            };

            // Run `RemoteSecretApplicationStartMonitorTask` until it yields the Remote Secret. The
            // active-profile mode handles failures by restarting; bounded archived-profile mode
            // rejects so optional restoration can preserve the archive and continue safely.
            const task = new RemoteSecretApplicationStartMonitorTask(
                services,
                remoteSecretData,
                remoteSecretRetrieval,
            );
            const {initialTimeoutMs, remoteSecret} = await task.run();

            try {
                encodedInner = decryptRemoteSecretBased(
                    intermediateInner.remoteSecretProtectedInner.encryptedInner,
                    {remoteSecret},
                    services,
                );
            } catch (error) {
                // The password layer was already decrypted successfully. Never report a later
                // Remote-Secret/ciphertext failure as a retryable password mismatch.
                throw new KeyStorageError(
                    'invalid',
                    'Unable to decrypt the Remote-Secret-protected inner key storage',
                    {from: error},
                );
            }
            initialRemoteSecretData = {
                ...remoteSecretData,
                initialTimeoutMs,
                raw: remoteSecret,
            };
            break;
        }

        default:
            unreachable(
                intermediateInner,
                new KeyStorageError(
                    'malformed',
                    `Encountered unrecognized intermediate inner case: ${intermediateInner}`,
                ),
            );
    }

    // Inner: Determine version, and decode.
    const innerVersion = bytesLeToU16(encodedInner.subarray(0, 2)) as InnerKeyStorage_Version;
    switch (innerVersion) {
        case InnerKeyStorage_Version.V1_0:
        case InnerKeyStorage_Version.V1_1:
            throw new KeyStorageError(
                'malformed',
                `Found legacy inner key storage inside non-legacy key storage file: ${innerVersion}`,
            );

        case InnerKeyStorage_Version.V2_0: {
            /* eslint-disable @typescript-eslint/no-deprecated */
            const decoded = INNER_KEY_STORAGE_V2_ENCODING_HELPERS.encodedToDecoded(
                encodedInner as unknown as DecryptedEncodedInnerKeyStorageV2Bytes,
            );
            const validated = INNER_KEY_STORAGE_V2_ENCODING_HELPERS.decodedToValidated(decoded);
            /* eslint-enable @typescript-eslint/no-deprecated */

            // Assign unchanged values directly.
            latestInnerValidated = pick(validated, [
                'identityData',
                'dgk',
                'databaseKey',
                'deviceIds',
                'deviceCookie',
            ] as const);
            // `onPremConfig` and `workCredentials` have moved to the intermediate layer, so we add it there.
            latestIntermediateValidated = {
                ...latestIntermediateValidated,
                onPremConfig:
                    validated.onPremConfig === undefined
                        ? undefined
                        : {...validated.onPremConfig, oppfCachedConfigIsFallback: false},
                workCredentials: validated.workCredentials,
            };
            break;
        }

        case InnerKeyStorage_Version.V3_0: {
            const decoded = INNER_KEY_STORAGE_V3_ENCODING_HELPERS.encodedToDecoded(
                encodedInner as unknown as DecryptedEncodedInnerKeyStorageV3Bytes,
            );
            const validated = INNER_KEY_STORAGE_V3_ENCODING_HELPERS.decodedToValidated(decoded);

            // Since this is already at the latest version, assign the contents directly.
            latestInnerValidated = pick(validated, [
                'identityData',
                'dgk',
                'databaseKey',
                'deviceIds',
                'deviceCookie',
            ] as const);
            break;
        }

        case InnerKeyStorage_Version.UNRECOGNIZED:
            throw new KeyStorageError(
                'malformed',
                `Encountered unrecognized inner key storage version: ${innerVersion}`,
            );

        default:
            unreachable(
                innerVersion,
                new KeyStorageError(
                    'malformed',
                    `Encountered unknown inner key storage version: ${innerVersion}`,
                ),
            );
    }

    // If any layer's version differs from latest, or the trusted live Remote Secret endpoint
    // replaced the cached one, key storage needs to be re-encoded.
    let encoded: LatestKeyStorageLayers['outer']['encoded'];
    let isMigrated: boolean;
    if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        outerVersion !== LATEST_KEY_STORAGE_VERSION.outer ||
        intermediateVersion !== LATEST_KEY_STORAGE_VERSION.intermediate ||
        innerVersion !== LATEST_KEY_STORAGE_VERSION.inner ||
        remoteSecretEndpointChanged
    ) {
        if (readOnly) {
            // The source bytes are returned only to satisfy the shared result shape; restoration
            // callers ignore `encoded` and never write migrations back to the archive.
            encoded = fileBytes as LatestKeyStorageLayers['outer']['encoded'];
        } else {
            const migratedIntermediateInner = encodeAndEncryptLatestInnerKeyStorage(
                latestInnerValidated,
                initialRemoteSecretData,
                services,
            );
            const migratedIntermediate = await encodeAndEncryptLatestIntermediateKeyStorage(
                migratedIntermediateInner,
                latestIntermediateValidated,
                {
                    password,
                    params: latestOuterValidated.kdfParameters.argon2id,
                },
                services,
            );
            encoded = encodeLatestOuterKeyStorage(migratedIntermediate, latestOuterValidated);
        }
        isMigrated = true;

        // Otherwise, we can return the existing file bytes as-is.
    } else {
        // Cast is fine, since nothing was migrated and the file already contained encoded bytes of
        // the latest key storage version.
        encoded = fileBytes as LatestKeyStorageLayers['outer']['encoded'];
        isMigrated = false;
    }

    return {
        consumable: {
            outer: latestOuterValidated,
            intermediate: latestIntermediateValidated,
            inner: latestInnerValidated,
        },
        encoded,
        initialRemoteSecretStoreData:
            initialRemoteSecretData === undefined
                ? undefined
                : pick(initialRemoteSecretData, [
                      'endpoint',
                      'hash',
                      'initialTimeoutMs',
                      'token',
                  ] as const),
        isMigrated,
    };
}
