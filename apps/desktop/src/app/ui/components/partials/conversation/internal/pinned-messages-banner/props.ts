import type {MessageId} from '~/common/network/types';

/**
 * Props accepted by the `PinnedMessagesBanner` component.
 */
export interface PinnedMessagesBannerProps {
    /** The pinned message ids, oldest-pinned first. Empty = no banner. */
    readonly pinnedMessageIds: readonly MessageId[];
    /**
     * Resolve a short text preview for a pinned message, if it is currently loaded. May return
     * `undefined` (a generic label is shown instead).
     */
    readonly getPreview?: (messageId: MessageId) => string | undefined;
    /** Jump to (scroll + highlight) the given pinned message. */
    readonly onjump: (messageId: MessageId) => void;
}
