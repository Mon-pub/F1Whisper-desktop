import type {AppServicesForSvelte} from '~/app/types';
import type {SingleUnicodeEmoji} from '~/common/utils/emoji';

/**
 * Props accepted by the `InlineEmojiSearchListComponent`
 */
export interface InlineEmojiSearchListProps {
    readonly onclickitem?: (emoji: SingleUnicodeEmoji) => void;
    readonly services: Pick<AppServicesForSvelte, 'emojis'>;
    readonly searchTerm: string;
}
