import type {AppServicesForSvelte} from '~/app/types';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';

/**
 * Props accepted by the `EmojiPicker` component.
 */
export interface EmojiPickerProps {
    /**
     * Unique id of an `EmojiPicker` instance. Note: This can be any `string`, but must be unique
     * across all usages of the `EmojiPicker`.
     */
    readonly id: string;
    readonly services: Pick<AppServicesForSvelte, 'backend'>;
    /**
     * List of emojis to display as highlighted in the picker. This is can be used to display emojis
     * that have already been selected by the user, for example.
     */
    readonly highlighted?: SingleUnicodeEmoji[];
    readonly onSelectEmoji?: (emoji: SingleUnicodeEmoji) => void;
}
