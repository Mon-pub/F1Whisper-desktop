import type {ServicesForBackend} from '~/common/backend';
import {fetchRawPreview} from '~/common/dom/network/link-preview/fetcher';
import {
    extractFirstPreviewUrl,
    isReceivedPreviewAllowed,
} from '~/common/dom/network/link-preview/parse';
import type {
    LinkPreviewBackend,
    LinkPreviewImage,
    LinkPreviewResult,
} from '~/common/dom/network/link-preview/types';
import {TRANSFER_HANDLER} from '~/common/index';
import type {Logger} from '~/common/logging';
// `getLinkPreviewNodeApi` loads Node's `net`/`dns`/`https` via a bare in-function `require(...)`, so
// this static import carries NO top-level `node:*` side effect — the function is tree-shaken out of
// the renderer bundle (where it is never called) and only runs in the backend WORKER. See the
// `link-preview-node` module header for the full bundling rationale.
import {
    getLinkPreviewNodeApi,
    type LinkPreviewNodeApi,
} from '~/common/node/network/link-preview-node';
import type {ReadonlyUint8Array} from '~/common/types';
import {ensureError} from '~/common/utils/assert';
import {PROXY_HANDLER} from '~/common/utils/endpoint';

type ServicesForLinkPreview = Pick<ServicesForBackend, 'logging' | 'media' | 'model'>;

/**
 * Backend (worker-side) implementation of the sender-side link-preview fetcher.
 *
 * Exposed to the renderer as a {@link LinkPreviewBackend} proxy (mirroring `FetchDirectoryBackend` /
 * `FetchWorkBackend`). Lives in the worker because the SSRF-safe fetch needs Node's `https`/`dns`
 * (not Chromium's pinned network stack). EXIF-strip / re-encode / placeholder generation are canvas
 * operations, which are NOT available in the worker — so those are delegated to the FRONTEND media
 * service (`services.media`, which RPCs to `IFrontendMediaService`). The image bytes the renderer
 * receives are therefore ALWAYS freshly re-encoded (EXIF/GPS stripped); the original og:image is
 * never forwarded verbatim.
 */
export class LinkPreviewBackendImpl implements LinkPreviewBackend {
    public readonly [TRANSFER_HANDLER] = PROXY_HANDLER;

    private readonly _log: Logger;
    /** Node `net`/`dns`/`https` primitives for the fetcher; built lazily once in the worker. */
    private _nodeApi: LinkPreviewNodeApi | undefined;

    public constructor(private readonly _services: ServicesForLinkPreview) {
        this._log = _services.logging.logger('network.link-preview');
    }

    /** @inheritdoc */
    public async fetchPreviewForText(text: string): Promise<LinkPreviewResult | undefined> {
        // Gate on the user's "Generate link previews" media setting (default on).
        if (!this._services.model.user.mediaSettings.get().view.linkPreviews) {
            return undefined;
        }

        const url = extractFirstPreviewUrl(text);
        if (url === undefined) {
            return undefined;
        }

        // `fetchRawPreview` itself imports NO `node:*` (this module is shared with the renderer's
        // static graph). The Node `net`/`dns`/`https` primitives are built here, in the backend
        // WORKER, by `getLinkPreviewNodeApi` (bare in-function `require`s — see its module header) and
        // cached for the life of this backend.
        this._nodeApi ??= getLinkPreviewNodeApi();
        const raw = await fetchRawPreview(url, this._nodeApi, this._log);
        if (raw === undefined) {
            return undefined;
        }

        const image = await this._buildPreviewImage(
            raw.url,
            raw.rawImageBytes,
            raw.rawImageMediaType,
        );
        if (image === undefined) {
            // Could not produce ANY image (re-encode + placeholder both failed) -> no card.
            return undefined;
        }

        return {
            url: raw.url,
            title: raw.title,
            description: raw.description,
            image,
        };
    }

    /** @inheritdoc */
    public isReceivedPreviewAllowed(url: string, caption: string | undefined): boolean {
        return isReceivedPreviewAllowed(url, caption);
    }

    /**
     * Produce the FINAL preview image: re-encode the fetched og:image through the frontend canvas
     * (strips EXIF, caps size); if there is no usable og:image, generate a domain-monogram
     * placeholder (so a title-only link still yields a sendable card — MODEL-A needs a blob).
     */
    private async _buildPreviewImage(
        url: string,
        rawImageBytes: Uint8Array | undefined,
        rawImageMediaType: string | undefined,
    ): Promise<LinkPreviewImage | undefined> {
        if (rawImageBytes !== undefined && rawImageBytes.byteLength > 0) {
            try {
                const mediaType =
                    rawImageMediaType?.startsWith('image/') === true
                        ? rawImageMediaType
                        : 'image/jpeg';
                // GenerateThumbnail downsizes + re-encodes via canvas => strips all EXIF/GPS metadata.
                const reencoded = await this._services.media.generateThumbnail(
                    rawImageBytes,
                    'image',
                    mediaType,
                );
                if (reencoded !== undefined && reencoded.bytes.byteLength > 0) {
                    const dimensions = await this._tryGetDimensions(
                        reencoded.bytes,
                        reencoded.mediaType,
                    );
                    return {
                        bytes: reencoded.bytes,
                        mediaType: reencoded.mediaType,
                        width: dimensions?.width ?? 0,
                        height: dimensions?.height ?? 0,
                        isPlaceholder: false,
                    };
                }
            } catch (error) {
                this._log.debug(
                    `Link preview image re-encode failed: ${ensureError(error).message}`,
                );
            }
        }

        // Fall back to a generated placeholder.
        try {
            const placeholder = await this._services.media.generateLinkPreviewPlaceholder(url);
            if (placeholder !== undefined && placeholder.bytes.byteLength > 0) {
                return {
                    bytes: placeholder.bytes,
                    mediaType: placeholder.mediaType,
                    width: placeholder.width,
                    height: placeholder.height,
                    isPlaceholder: true,
                };
            }
        } catch (error) {
            this._log.debug(
                `Link preview placeholder generation failed: ${ensureError(error).message}`,
            );
        }

        return undefined;
    }

    private async _tryGetDimensions(
        bytes: ReadonlyUint8Array,
        mediaType: string,
    ): Promise<{readonly width: number; readonly height: number} | undefined> {
        try {
            return await this._services.media.getImageDimensions(bytes, mediaType);
        } catch {
            return undefined;
        }
    }
}
