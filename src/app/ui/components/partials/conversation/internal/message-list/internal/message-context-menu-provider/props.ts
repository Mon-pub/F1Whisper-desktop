import type {EmojiReactionsStripProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/internal/emoji-reactions-strip/props';
import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

/**
 * Props accepted by the `MessageContextMenuProvider` component.
 */
export interface MessageContextMenuProviderProps {
    /**
     * Optional `HTMLElement` to use as the boundary for this message. This is used to constrain the
     * positioning of the context menu. Note: This is usually the chat view this message is part of.
     */
    readonly boundary?: SvelteNullableBinding<HTMLElement>;
    /**
     * Id to use as the `anchor-name` of the caret button contained in this context menu. Note: This
     * must be unique across all instances of the context menu.
     */
    readonly caretAnchorName: `--${string}`;
    /**
     * Which options to render in the context menu, if available.
     */
    readonly enabledOptions: {
        readonly copyLink: boolean;
        readonly copySelection: boolean;
        readonly copyImage: boolean;
        readonly copy: boolean;
        readonly edit:
            | false
            | {
                  disabled: boolean;
              };
        readonly saveAsFile: boolean;
        readonly quote: boolean;
        readonly forward: boolean;
        readonly openDetails: boolean;
        readonly deleteMessage: boolean;
    };
    /**
     * Whether to show emoji reactions.
     */
    readonly emojiReactions:
        | {readonly enabled: false}
        | {
              readonly enabled: true;
              /**
               * Whether to allow all emojis and the `EmojiPicker` or to grey out all emojis that
               * are not mapped to ack/dec.
               */
              readonly fullSupport: boolean;
              readonly ownReactions: EmojiReactionsStripProps['reactions'];
          };
    readonly options?: {
        /** Whether to always show the caret (instead of only on hover). Defaults to `false`. */
        readonly alwaysShowCaret?: boolean;
    };
    /**
     * On which side of the message the context menu should be placed. Note: If it is opened using a
     * right click, the context menu will always be placed at the mouse's location.
     */
    readonly placement: 'left' | 'right';
}
