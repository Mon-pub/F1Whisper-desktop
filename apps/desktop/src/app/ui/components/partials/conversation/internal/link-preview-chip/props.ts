import type {LinkPreviewResult} from '~/common/dom/network/link-preview/types';

/**
 * Props accepted by the `LinkPreviewChip` component.
 */
export interface LinkPreviewChipProps {
    /** The fetched link preview to display. */
    readonly preview: LinkPreviewResult;
    /** Invoked when the user dismisses the chip. */
    readonly ondismiss: () => void;
}
