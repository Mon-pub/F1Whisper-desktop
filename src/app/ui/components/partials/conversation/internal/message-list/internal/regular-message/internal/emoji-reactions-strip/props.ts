import type {SingleUnicodeEmoji, UnsupportedEmoji} from '~/common/utils/emoji';

/**
 * Props accepted by the `EmojiReactionsStrip` component.
 */
export interface EmojiReactionsStripProps {
    /** Direction of the message. */
    readonly direction: 'inbound' | 'outbound';
    readonly onClickBucket?: (emoji: SingleUnicodeEmoji | UnsupportedEmoji) => void;
    /**
     * Since the emoji comes from the picker, it is of type `SingleUnicodeEmoji` here
     */
    readonly onPickEmoji?: (emoji: SingleUnicodeEmoji) => void;
    readonly reactions: Reaction[];
}

export type Reaction = SupportedReaction | UnsupportedReaction;

export interface CommonReaction {
    readonly direction: 'inbound' | 'outbound';
    readonly at: Date;
    readonly sender: {
        readonly name: string;
    };
}

interface SupportedReaction extends CommonReaction {
    readonly type: 'supported';
    readonly emoji: SingleUnicodeEmoji;
}

interface UnsupportedReaction extends CommonReaction {
    readonly type: 'unsupported';
    readonly emoji: UnsupportedEmoji;
}
