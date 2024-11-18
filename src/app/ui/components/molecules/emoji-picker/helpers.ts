import type {I18nType} from '~/app/ui/i18n-types';
import type {EmojiGroupId} from '~/common/utils/emoji';

// Mapping from group name to the material icon name representing this group.
export const EMOJI_GROUP_ICON: Record<EmojiGroupId, string> = {
    'smileys-emotion': 'emoji_emotions',
    'people-body': 'emoji_people',
    'animals-nature': 'park',
    'food-drink': 'restaurant',
    'travel-places': 'train',
    'activities': 'emoji_events',
    'objects': 'emoji_objects',
    'symbols': 'emoji_symbols',
    'flags': 'flag',
};

// Mapping from group name to the human-readable group title.
export async function getEmojiGroupTitle(i18n: I18nType): Promise<Record<EmojiGroupId, string>> {
    const {locale} = i18n;
    const groups = await import(
        `../../../../../../node_modules/emojibase-data/${locale}/messages.json`
    ).then(
        (json: {
            readonly default: {
                readonly groups: {
                    readonly key: EmojiGroupId;
                    readonly message: string;
                }[];
            };
        }) => json.default.groups,
    );

    // eslint-disable-next-line func-style
    const findTitleByGroupId = (id: EmojiGroupId): string | undefined =>
        groups.find(({key}) => key === id)?.message;

    // prettier-ignore
    return {
        'smileys-emotion': findTitleByGroupId('smileys-emotion') ?? 'Smileys & Emotion',
        'people-body': findTitleByGroupId('people-body') ?? 'People & Body',
        'animals-nature': findTitleByGroupId('animals-nature') ?? 'Animals & Nature',
        'food-drink': findTitleByGroupId('food-drink') ?? 'Food & Drink',
        'travel-places': findTitleByGroupId('travel-places') ?? 'Travel & Places',
        'activities': findTitleByGroupId('activities') ?? 'Activities',
        'objects': findTitleByGroupId('objects') ?? 'Objects',
        'symbols': findTitleByGroupId('symbols') ?? 'Symbols',
        'flags': findTitleByGroupId('flags') ?? 'Flags',
    };
}
