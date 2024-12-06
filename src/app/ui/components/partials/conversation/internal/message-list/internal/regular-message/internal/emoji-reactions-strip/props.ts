import type {SingleUnicodeEmoji} from '~/common/utils/emoji';

/**
 * Props accepted by the `EmojiReactionsStrip` component.
 */
export interface EmojiReactionsStripProps {
    /** Direction of the message. */
    readonly direction: 'inbound' | 'outbound';
    readonly onClickBucket?: (emoji: SingleUnicodeEmoji) => void;
    readonly reactions: Reaction[];
}

export interface Reaction {
    /** Direction of the reaction. */
    readonly direction: 'inbound' | 'outbound';
    readonly emoji: SingleUnicodeEmoji;
    readonly at: Date;
    readonly sender: {
        readonly name: string;
    };
}
