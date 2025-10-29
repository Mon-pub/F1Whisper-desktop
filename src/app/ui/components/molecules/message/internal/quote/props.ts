import type {HTMLButtonAttributes} from 'svelte/elements';

import type {ProseProps} from '~/app/ui/components/atoms/prose/props';
import type {MessageProps} from '~/app/ui/components/molecules/message/props';

/**
 * Props accepted by the `Quote` component.
 */
export interface QuoteProps extends Pick<HTMLButtonAttributes, 'onclick'> {
    /** Alt text for media previews, if needed. */
    readonly alt: MessageProps['alt'];
    /** Optional text content or caption of the message. */
    readonly content?: ProseProps['content'];
    /**
     * Whether clicking on the quote should be enabled. Defaults to `false`.
     */
    readonly clickable?: boolean;
    /** Optional file data, if this is a file-based message. */
    readonly file?: MessageProps['file'];
    /** The mode of this component. Defaults to quote. */
    readonly mode?: 'quote' | 'edit';
    /** Details about the message sender. */
    readonly sender?: MessageProps['sender'];
    /** Optional poll data, if this is a poll-based message. */
    readonly poll?: MessageProps['pollData'];
}
