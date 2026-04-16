import * as v from '@badrap/valita';

import {ensureEncryptedDataWithNonceAhead} from '~/common/crypto';
import {OuterKeyStorageV1} from '~/common/internal-protobuf/key-storage-file';
import {KeyStorageError} from '~/common/key-storage/common';
import type {KeyStorageLayerEncodingHelpers} from '~/common/key-storage/layers/common';
import {ARGON2ID_PARAMETERS_SCHEMA} from '~/common/key-storage/layers/outer/common';
import type {WeakOpaque} from '~/common/types';
import {instanceOf} from '~/common/utils/valita-helpers';

// Encoding

/**
 * Branded type that represents the encoded bytes of an {@link OuterKeyStorageV1} as stored on disk.
 *
 * Important: This version does not have a version prefix prepended, as this was only added in later
 * outer key storage versions.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export type EncodedOuterKeyStorageV1Bytes = WeakOpaque<
    Uint8Array,
    {readonly EncodedOuterKeyStorageV1Bytes: unique symbol}
>;

// Validation

/**
 * Validation schema for the {@link OuterKeyStorageV1} contents.
 *
 * Note: It's important that all objects are annotated with `.rest(v.unknown())` to ensure forwards
 * compatibility!
 *
 * @deprecated Should only be used for one-time migrations.
 * @throws {ValitaError} In case validation fails.
 */
const OUTER_KEY_STORAGE_V1_SCHEMA = v
    .object({
        // Embedded schema version (1).
        schemaVersion: v.literal(1),
        // Encrypted inner key storage.
        encryptedKeyStorage: instanceOf(Uint8Array).map(ensureEncryptedDataWithNonceAhead),
        // KDF parameters.
        kdfParameters: v
            .object({
                $case: v.literal('argon2id'),
                argon2id: ARGON2ID_PARAMETERS_SCHEMA,
            })
            .rest(v.unknown()),
    })
    .rest(v.unknown());

/**
 * Validated {@link OuterKeyStorageV1} contents.
 *
 * @deprecated Should only be used for one-time migrations.
 * @throws {ValitaError} In case validation fails.
 */
export type ValidatedOuterKeyStorageV1 = Readonly<v.Infer<typeof OUTER_KEY_STORAGE_V1_SCHEMA>>;

// Consumption

/**
 * {@link OuterKeyStorageV1} data intended for external consumption.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export type OuterKeyStorageV1Data = Pick<ValidatedOuterKeyStorageV1, 'kdfParameters'>;

/**
 * Helpers for encoding, decoding, validation, as well as transforming data for external
 * consumption.
 *
 * @deprecated Should only be used for one-time migrations.
 */
export const OUTER_KEY_STORAGE_V1_ENCODING_HELPERS: KeyStorageLayerEncodingHelpers<
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    EncodedOuterKeyStorageV1Bytes,
    OuterKeyStorageV1,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    typeof OUTER_KEY_STORAGE_V1_SCHEMA,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    OuterKeyStorageV1Data
> = {
    // Encoded -> Decoded -> Validated -> Consumable.

    encodedToDecoded: (encoded) => {
        try {
            return OuterKeyStorageV1.decode(encoded);
        } catch (error) {
            throw new KeyStorageError(
                'malformed',
                'OUTER_KEY_STORAGE_V1_ENCODING_HELPERS: Failed to decode',
                {
                    from: error,
                },
            );
        }
    },
    decodedToValidated: (decoded) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            return OUTER_KEY_STORAGE_V1_SCHEMA.parse(decoded);
        } catch (error) {
            throw new KeyStorageError(
                'invalid',
                'OUTER_KEY_STORAGE_V1_ENCODING_HELPERS: Validation failed',
                {
                    from: error,
                },
            );
        }
    },
    validatedToConsumable: (validated) => ({
        kdfParameters: validated.kdfParameters,
    }),

    // Consumable -> Validated -> Decoded -> Encoded.

    consumableToValidated: () => {
        throw new KeyStorageError(
            'internal-error',
            'OUTER_KEY_STORAGE_V1_ENCODING_HELPERS: Refusing to transform to validated: OuterKeyStorageV1 is deprecated and should not be used for encoding anymore',
        );
    },
    validatedToDecoded: () => {
        throw new KeyStorageError(
            'internal-error',
            'OUTER_KEY_STORAGE_V1_ENCODING_HELPERS: Refusing to transform to decoded: OuterKeyStorageV1 is deprecated and should not be used for encoding anymore',
        );
    },
    decodedToEncoded: () => {
        throw new KeyStorageError(
            'internal-error',
            'OUTER_KEY_STORAGE_V1_ENCODING_HELPERS: Refusing to encode: OuterKeyStorageV1 is deprecated and should not be used for encoding anymore',
        );
    },
};
