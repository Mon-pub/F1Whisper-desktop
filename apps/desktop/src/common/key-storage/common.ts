import {TransferTag} from '~/common/enum';
import {BaseError, type BaseErrorOptions} from '~/common/error';
import {TRANSFER_HANDLER} from '~/common/index';
import {registerErrorTransferHandler} from '~/common/utils/endpoint';

// Marker used to brand byte types that carry a prepended u16-le version number.
declare const KEY_STORAGE_VERSION_PREFIX_MARKER: unique symbol;

/**
 * Marker type for branded byte sequences that include a prepended u16-le version number, as per
 * each layer's encoding spec.
 *
 * Intersect this into any byte type whose encoding spec prepends `u16-le(version)`, i.e., all
 * decrypted encoded byte types for generation 2 and later. Byte types without a version prefix
 * (e.g. {@link DecryptedEncodedInnerKeyStorageV1Bytes} or any encrypted byte type) must NOT carry
 * this marker.
 */
export interface KeyStorageVersionPrefixMarked {
    readonly [KEY_STORAGE_VERSION_PREFIX_MARKER]: true;
}

/**
 * Type of the {@link KeyStorageError}.
 *
 * - internal-error: An internal error occurred during loading or writing of the key storage.
 * - invalid: Key storage validation fails after decrypting / decoding.
 * - malformed: Key storage is malformed (e.g. non-protobuf contents).
 * - migration-error: The migration of the key storage to a new version failed.
 * - not-found: Key storage or key storage directory cannot be found.
 * - not-initialized: Key storage was used before it was initialized.
 * - not-readable: Key storage is not readable.
 * - not-writable: Key storage is not writable.
 * - undecryptable: Key storage cannot be decrypted.
 */
type KeyStorageErrorType =
    | 'internal-error'
    | 'invalid'
    | 'malformed'
    | 'migration-error'
    | 'not-found'
    | 'not-initialized'
    | 'not-readable'
    | 'not-writable'
    | 'undecryptable';

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
