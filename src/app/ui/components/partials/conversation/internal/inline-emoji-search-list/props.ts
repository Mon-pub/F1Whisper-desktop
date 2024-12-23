import type {AppServicesForSvelte} from '~/app/types';

/**
 * Props accepted by the `InlineEmojiSearchListComponent`
 */
export interface InlineEmojiSearchListProps {
    readonly services: Pick<AppServicesForSvelte, 'emojis'>;
    readonly searchTerm: string;
}
