import type * as v from '@badrap/valita';

import type {WeakOpaque} from '~/common/types';

/**
 * Generic interface to represent the helpers needed to encode and decode data of a given versioned
 * key storage layer, e.g. `InnerKeyStorageV2`. Implement this for every layer and version.
 */
export interface KeyStorageLayerEncodingHelpers<
    /**
     * Branded type representing decrypted bytes containing the respective layer's Protobuf message.
     * Note: If the layer has a prepended version according to its spec, they are expected to be
     * present in objects of this type.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TDecryptedEncoded extends WeakOpaque<Uint8Array, any> = WeakOpaque<Uint8Array, unknown>,
    /**
     * Type of the decrypted and decoded data, i.e., the output type of the `decode` function of the
     * respective layer's Protobuf message.
     */
    TDecryptedDecoded = object,
    /**
     * Schema for validating the raw decrypted and decoded data. Note: This represents the raw shape
     * of the data after decoding of the respective layer, including further nested layers that are
     * still encoded and encrypted.
     */
    TDecryptedDecodedSchema extends v.Type = v.Type,
    /**
     * Shape of the data belonging to the respective layer only, excluding nested layers. This is
     * the representation of the data as returned to consumers of the key storage.
     */
    TConsumable extends Record<string, unknown> = Record<string, unknown>,
> {
    // Encoded -> Decoded -> Validated -> Consumable.

    /**
     * Decode encoded data of the layer.
     *
     * @throws {KeyStorageError} if decoding fails.
     */
    readonly encodedToDecoded: (encoded: TDecryptedEncoded) => TDecryptedDecoded;
    /**
     * Validate decoded data of the layer.
     *
     * @throws {KeyStorageError} if validation fails.
     */
    readonly decodedToValidated: (
        decoded: TDecryptedDecoded,
    ) => Readonly<v.Infer<TDecryptedDecodedSchema>>;
    /**
     * Transform validated data to the shape intended for consumers of the key storage.
     */
    readonly validatedToConsumable: (
        validated: Readonly<v.Infer<TDecryptedDecodedSchema>>,
    ) => TConsumable;

    // Consumable -> Validated -> Decoded -> Encoded.

    /**
     * Transform data from its consumable shape back into its validated shape. Requires the current
     * validated representation to fill in the gaps for any fields absent in the partial consumable.
     */
    readonly consumableToValidated: (
        current: Readonly<v.Infer<TDecryptedDecodedSchema>>,
        consumable: Partial<TConsumable>,
    ) => Readonly<v.Infer<TDecryptedDecodedSchema>>;
    /**
     * Transform validated data into the decoded (Protobuf) shape. Inverse of
     * {@link decodedToValidated}.
     */
    readonly validatedToDecoded: (
        validated: Readonly<v.Infer<TDecryptedDecodedSchema>>,
    ) => TDecryptedDecoded;
    /**
     * Encode decoded data of the layer, reversing {@link encodedToDecoded}.
     *
     * @throws {KeyStorageError} if encoding fails.
     */
    readonly decodedToEncoded: (decoded: TDecryptedDecoded) => TDecryptedEncoded;
}
