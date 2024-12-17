import type {SingleUnicodeEmoji, UnsupportedEmoji} from '~/common/utils/emoji';
import type {FeatureSupport} from '~/common/viewmodel/conversation/main/store/types';

/**
 * Props accepted by the `EmojiReactionsStrip` component.
 */
export interface EmojiReactionsStripProps {
    /**
     * Id of this element. Note: This must be unique across the entire DOM.
     */
    readonly id: string;
    readonly conversation: {
        readonly emojiReactionsFeatureSupport: FeatureSupport;
    };
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
    readonly sender:
        | {
              readonly type: 'self';
          }
        | {
              readonly type: 'contact';
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
