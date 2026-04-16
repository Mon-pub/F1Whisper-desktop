import * as v from '@badrap/valita';

import type {EncryptedDataWithNonceAhead} from '~/common/crypto';
import {wrapRawDatabaseKey} from '~/common/db';
import {InnerKeyStorageV1} from '~/common/internal-protobuf/key-storage-file';
import {KeyStorageError} from '~/common/key-storage/common';
import type {KeyStorageLayerEncodingHelpers} from '~/common/key-storage/layers/common';
import {
    ensureCspDeviceId,
    ensureD2mDeviceId,
    ensureDeviceCookie,
    ensureIdentityString,
    ensureServerGroup,
} from '~/common/network/types';
import {wrapRawClientKey, wrapRawDeviceGroupKey} from '~/common/network/types/keys';
import type {WeakOpaque} from '~/common/types';
import {instanceOf, unsignedLongAsU64} from '~/common/utils/valita-helpers';

// Encryption

/**
 * Branded type that represents encrypted encoded bytes of an {@link InnerKeyStorageV1}.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export type EncryptedEncodedInnerKeyStorageV1Bytes = WeakOpaque<
    EncryptedDataWithNonceAhead,
    {readonly EncryptedEncodedInnerKeyStorageV1Bytes: unique symbol}
>;

/**
 * Branded type that represents decrypted encoded bytes of an {@link InnerKeyStorageV1}.
 *
 * Important: This version does not have a version prefix prepended, as this was only added in later
 * inner key storage versions.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export type DecryptedEncodedInnerKeyStorageV1Bytes = WeakOpaque<
    Uint8Array,
    {readonly DecryptedEncodedInnerKeyStorageV1Bytes: unique symbol}
>;

// Validation

/**
 * Validation schema for the {@link InnerKeyStorageV1} contents.
 *
 * Note: It's important that all objects are annotated with `.rest(v.unknown())` to ensure forwards
 * compatibility!
 *
 * @deprecated Should only be used for one-time migrations.
 * @throws {ValitaError} In case validation fails.
 */
const INNER_KEY_STORAGE_V1_SCHEMA = v
    .object({
        // Current schema version.
        schemaVersion: v.literal(2),

        // Identity related information.
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
        onPremConfig: v
            .object({
                oppfUrl: v.string(),
                oppfCachedConfig: v.string(),
                lastUpdated: unsignedLongAsU64(),
            })
            .rest(v.unknown())
            .optional(),
    })
    .rest(v.unknown());

/**
 * Validated {@link InnerKeyStorageV1} contents.
 *
 * @deprecated Should only be used for one-time migrations.
 * @throws {ValitaError} In case validation fails.
 */
export type ValidatedInnerKeyStorageV1 = Readonly<v.Infer<typeof INNER_KEY_STORAGE_V1_SCHEMA>>;

// Consumption

/**
 * {@link InnerKeyStorageV1} data intended for external consumption.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export type InnerKeyStorageV1Data = Pick<
    ValidatedInnerKeyStorageV1,
    | 'identityData'
    | 'dgk'
    | 'databaseKey'
    | 'deviceIds'
    | 'deviceCookie'
    | 'workCredentials'
    | 'onPremConfig'
>;

/**
 * Helpers for encoding, decoding, validation, as well as transforming data for external
 * consumption.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export const INNER_KEY_STORAGE_V1_ENCODING_HELPERS: KeyStorageLayerEncodingHelpers<
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    DecryptedEncodedInnerKeyStorageV1Bytes,
    InnerKeyStorageV1,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    typeof INNER_KEY_STORAGE_V1_SCHEMA,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    InnerKeyStorageV1Data
> = {
    // Encoded -> Decoded -> Validated -> Consumable.

    encodedToDecoded: (encoded) => {
        try {
            return InnerKeyStorageV1.decode(encoded);
        } catch (error) {
            throw new KeyStorageError(
                'malformed',
                'INNER_KEY_STORAGE_V1_ENCODING_HELPERS: Failed to decode',
                {
                    from: error,
                },
            );
        }
    },
    decodedToValidated: (decoded) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            return INNER_KEY_STORAGE_V1_SCHEMA.parse(decoded);
        } catch (error) {
            throw new KeyStorageError(
                'invalid',
                'INNER_KEY_STORAGE_V1_ENCODING_HELPERS: Validation failed',
                {
                    from: error,
                },
            );
        }
    },
    validatedToConsumable: (validated) => ({
        identityData: validated.identityData,
        dgk: validated.dgk,
        databaseKey: validated.databaseKey,
        deviceIds: validated.deviceIds,
        deviceCookie: validated.deviceCookie,
        workCredentials: validated.workCredentials,
        onPremConfig: validated.onPremConfig,
    }),

    // Consumable -> Validated -> Decoded -> Encoded.

    consumableToValidated: () => {
        throw new KeyStorageError(
            'internal-error',
            'INNER_KEY_STORAGE_V1_ENCODING_HELPERS: Refusing to transform to validated: InnerKeyStorageV1 is deprecated and should not be used for encoding anymore',
        );
    },
    validatedToDecoded: () => {
        throw new KeyStorageError(
            'internal-error',
            'INNER_KEY_STORAGE_V1_ENCODING_HELPERS: Refusing to transform to decoded: InnerKeyStorageV1 is deprecated and should not be used for encoding anymore',
        );
    },
    decodedToEncoded: () => {
        throw new KeyStorageError(
            'internal-error',
            'INNER_KEY_STORAGE_V1_ENCODING_HELPERS: Refusing to encode: InnerKeyStorageV1 is deprecated and should not be used for encoding anymore',
        );
    },
};
