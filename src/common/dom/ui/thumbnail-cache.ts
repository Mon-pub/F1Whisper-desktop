import type {DbReceiverLookup} from '~/common/db';
import type {BackendController} from '~/common/dom/backend/controller';
import type {Logger} from '~/common/logging';
import type {MessageId} from '~/common/network/types';
import type {Dimensions, WeakOpaque} from '~/common/types';
import {unreachable} from '~/common/utils/assert';
import type {FileBytesAndMediaType} from '~/common/utils/file';
import {WeakValueMap} from '~/common/utils/map';
import {WritableStore, type IQueryableStore, type IQueryableStoreValue} from '~/common/utils/store';

export type ThumbnailStore = IQueryableStore<'loading' | ThumbnailStoreValue | undefined>;

type CacheKey = WeakOpaque<string, {readonly CacheKey: unique symbol}>;

export interface ThumbnailStoreValue {
    readonly blob: Blob;
    readonly dimensions: Dimensions;
}

function cacheKeyForMessageThumbnail(
    messageId: MessageId,
    receiverLookup: DbReceiverLookup,
): CacheKey {
    return `thumb.${receiverLookup.type}.${receiverLookup.uid}.${messageId}` as CacheKey;
}

/**
 * The thumbnail cache service caches thumbnail stores.
 *
 * The stores in the cache are weakly referenced. This means that if all references to the store are
 * dropped, then it will be automatically removed from the cache when garbage collection kicks in.
 */
export class ThumbnailCacheService {
    private readonly _cache = new WeakValueMap<
        CacheKey,
        WritableStore<IQueryableStoreValue<ThumbnailStore>>
    >();

    public constructor(
        private readonly _backend: BackendController,
        private readonly _log: Logger,
    ) {}

    /**
     * Return the {@link ThumbnailStore} associated with the specified {@link messageId} within the
     * conversation with {@link receiverLookup}. This function also calculates its dimensions using
     * {@link createImageBitmap}.
     *
     * The store will be returned immediately with the value 'loading'. It will be updated
     * asynchronously with the thumbnail bytes. If the message cannot be found or if there is no
     * thumbnail, then the store will be updated with `undefined`.
     *
     * If `expctedDimensions` are provided, the returned {@link ThumbnailStore} will contain these
     * dimensions as a heuristic for faster rendering. {@link createImageBitmap} will be ran
     * asynchronously and the dimensions will be correctly set as soon as it has finished.
     */
    public getMessageThumbnail(
        messageId: MessageId,
        receiverLookup: DbReceiverLookup,
        expectedDimensions: Dimensions | undefined,
    ): ThumbnailStore {
        const key = cacheKeyForMessageThumbnail(messageId, receiverLookup);
        return this._cache.getOrCreate(key, () => {
            const store = new WritableStore<IQueryableStoreValue<ThumbnailStore>>('loading');
            this._getMessageThumbnailBytes(messageId, receiverLookup)
                .then((result) => {
                    if (result === undefined) {
                        store.set(undefined);
                        return;
                    }
                    const blob = new Blob([result.bytes], {type: result.mediaType});
                    if (expectedDimensions !== undefined) {
                        store.set({
                            blob,
                            dimensions: expectedDimensions,
                        });
                    }
                    createImageBitmap(blob)
                        .then((bitmap) => {
                            store.set({
                                blob,
                                dimensions: {height: bitmap.height, width: bitmap.width},
                            });
                        })
                        .catch(() => {
                            this._log.warn(
                                `Creating bitmap of type ${blob.type} from ${blob.size}-byte blob failed. Wrong media type or corrupted bytes?`,
                            );
                            store.set(undefined);
                        });
                })
                .catch((error: unknown) =>
                    this._log.warn(`Failed to fetch message thumbnail bytes: ${error}`),
                );
            return store;
        });
    }

    /**
     * Refresh the cache from the database and update the associated store.
     */
    public refreshCacheForMessage(messageId: MessageId, receiverLookup: DbReceiverLookup): void {
        // Look up current store
        const key = cacheKeyForMessageThumbnail(messageId, receiverLookup);
        const store = this._cache.get(key);

        // If store isn't present in cache, then nothing needs to be refreshed (since there are no
        // subscribers anyways).
        if (store === undefined) {
            return;
        }

        // Refresh store by re-loading thumbnail bytes.
        this._getMessageThumbnailBytes(messageId, receiverLookup)
            .then((result) => {
                if (result === undefined) {
                    store.set(undefined);
                    return;
                }

                const blob = new Blob([result.bytes], {type: result.mediaType});
                createImageBitmap(blob)
                    .then((bitmap) => {
                        store.set({blob, dimensions: {height: bitmap.height, width: bitmap.width}});
                    })
                    .catch(() => {
                        this._log.warn(
                            `Creating bitmap of type ${blob.type} from ${blob.size}-byte blob failed. Wrong media type or corrupted bytes?`,
                        );
                        store.set(undefined);
                    });
            })
            .catch((error: unknown) =>
                this._log.warn(`Failed to refresh message thumbnail bytes: ${error}`),
            );
    }

    /**
     * Clears the cache.
     *
     * Since image loading is an expensive operation, this should be used sparingly.
     */
    public clearCache(): void {
        this._cache.clear();
    }

    /**
     * Return the thumbnail bytes for the specified {@link messageId} within the conversation with
     * {@link receiverLookup}.
     *
     * Return `syncing` if the thumbnail bytes are not present yet but the state is `syncing`.
     *
     * Return `undefined` in the following cases:
     *
     * - The converseation was not found
     * - The message was not found
     * - The message does not have a thumbnail
     *
     * Otherwise, return the thumbnail bytes along with the media type.
     */
    private async _getMessageThumbnailBytes(
        messageId: MessageId,
        receiverLookup: DbReceiverLookup,
    ): Promise<FileBytesAndMediaType | undefined> {
        const conversation = await this._backend.model.conversations.getForReceiver(receiverLookup);
        if (conversation === undefined) {
            return undefined;
        }
        const message = await conversation.get().controller.getMessage(messageId);
        if (message === undefined) {
            return undefined;
        }
        switch (message.type) {
            case 'image':
            case 'video': {
                return await message.get().controller.thumbnailBlob();
            }
            case 'text':
            case 'audio':
            case 'file':
            case 'deleted':
            case 'poll':
                return undefined;
            default:
                return unreachable(message);
        }
    }
}
