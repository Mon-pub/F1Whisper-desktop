import type {SingleUnicodeEmoji, UnsupportedEmoji} from '~/common/utils/emoji';

/**
 * Props accepted by the `EmojiReactionsStrip` component.
 */
export interface EmojiReactionsStripProps {
    /** Direction of the message. */
    readonly direction: 'inbound' | 'outbound';
    readonly onClickBucket: (
        event: MouseEvent,
        emoji: SingleUnicodeEmoji | UnsupportedEmoji,
    ) => void;
    readonly onClickOpenEmojiPicker: (event: MouseEvent) => void;
    /**
     * Id to use as the `anchor-name` of the emoji picker button contained in this
     * `EmojiReactionsStrip`. Note: This must be unique across all instances of the
     * `EmojiReactionsStrip`.
     */
    readonly openEmojiPickerButtonAnchorName: `--${string}`;
    readonly options?: {
        /**
         * Whether or not to show the add emoji reaction button. Defaults to false.
         */
        showAddEmojiReactionButton?: boolean;
    };
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
