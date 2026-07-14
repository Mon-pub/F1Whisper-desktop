import type {ReadonlyUint8Array} from '~/common/types';
import type {ProxyMarked} from '~/common/utils/endpoint';

/**
 * The re-encoded (EXIF-stripped) preview image plus its media type, as produced by the sender-side
 * fetcher. The bytes are always a freshly re-encoded JPEG (the original og:image is never forwarded
 * verbatim, so no EXIF/GPS metadata can leak), or a generated domain-monogram placeholder when the
 * page had no usable image.
 */
export interface LinkPreviewImage {
    readonly bytes: ReadonlyUint8Array;
    readonly mediaType: string;
    readonly width: number;
    readonly height: number;
    /** Whether this image is a generated placeholder (no real og:image was found). */
    readonly isPlaceholder: boolean;
}

/**
 * The result of a sender-side link-preview fetch. This is what the renderer's compose-bar chip
 * displays, and what is turned into an outbound MODEL-A image message on send.
 *
 * IMPORTANT: this is produced ONLY on the sending device. The preview (image + url/title/description)
 * then travels end-to-end as an ordinary image message carrying the `lp_u`/`lp_t`/`lp_d` metadata, so
 * the RECIPIENT never contacts the target URL.
 */
export interface LinkPreviewResult {
    /** The validated https URL the preview is for. */
    readonly url: string;
    /** The og:title (or `<title>`), truncated. May be empty. */
    readonly title: string | undefined;
    /** The og:description, truncated. May be empty. */
    readonly description: string | undefined;
    /** The preview image (real og:image re-encoded, or a generated placeholder). */
    readonly image: LinkPreviewImage;
}

/**
 * Renderer-facing interface for the sender-side link-preview fetcher.
 *
 * This is exposed from the backend worker to the UI thread as a {@link ProxyMarked} remote (mirroring
 * `FetchDirectoryBackend` / `FetchWorkBackend`). The compose-bar chip (builder-ui) calls
 * {@link fetchPreviewForText} with the current compose text; it returns the preview for the FIRST
 * https URL in the text, or `undefined` when there is no previewable URL, previews are disabled, or
 * the fetch failed. The call never throws and never blocks the UI (all network I/O is in the worker).
 *
 * Usage in the renderer:
 *
 * ```ts
 * // `backend.linkPreview` is a RemoteProxy<LinkPreviewBackend>.
 * const preview = await backend.linkPreview.fetchPreviewForText(composeText);
 * if (preview !== undefined) {
 *     // Show the chip: preview.title / preview.url's host / preview.image.bytes.
 *     // On send, attach preview.image as an image message with the user's text as caption,
 *     // and thread preview.url/title/description into the image init (lp_u/lp_t/lp_d).
 * }
 * ```
 *
 * Debouncing and the stale-fetch guard (a newer URL superseding an in-flight fetch) live in the
 * renderer chip controller; the backend method is a stateless one-shot fetch.
 */
export interface LinkPreviewBackend extends ProxyMarked {
    /**
     * Extract the first previewable https URL from {@link text} and fetch its preview.
     *
     * @returns the preview, or `undefined` if previews are disabled (media setting off), no
     *   previewable URL is present, the URL fails SSRF validation, or the fetch yields nothing
     *   usable.
     */
    readonly fetchPreviewForText: (text: string) => Promise<LinkPreviewResult | undefined>;

    /**
     * Re-validate that a received link-preview card is safe to render. Called on the RECEIVE side:
     * the card's URL must (1) pass the SSRF/spoofing validator and (2) actually appear in the message
     * caption — otherwise a malicious sender could attach a card for a URL the user never sees.
     *
     * @param url the `lp_u` value from the received message metadata.
     * @param caption the message caption text (the `d` field).
     * @returns `true` if the card may be rendered.
     */
    readonly isReceivedPreviewAllowed: (url: string, caption: string | undefined) => boolean;
}

/** Maximum length of the title / description fields stored in the preview (and on the wire). */
export const LINK_PREVIEW_MAX_FIELD_LENGTH = 500;
