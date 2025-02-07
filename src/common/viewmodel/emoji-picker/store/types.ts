import type {SingleUnicodeEmoji} from '~/common/utils/emoji';

export interface EmojiPickerViewModel {
    /**
     * Mapping from customized base emojis to the respective emoji in the preferred skin tone.
     */
    readonly skinTonePreferences: Map<SingleUnicodeEmoji, SingleUnicodeEmoji>;
    /**
     * The current most recent emojis, sorted and sliced.
     */
    readonly sortedMostRecentEmojis: SingleUnicodeEmoji[];
}
