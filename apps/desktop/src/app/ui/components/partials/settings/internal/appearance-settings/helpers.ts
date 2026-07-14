import type {SettingsDropdown} from '~/app/ui/components/partials/settings/types';
import {LOCALES, LOCALE_NAMES, type Locale} from '~/app/ui/i18n';
import type {I18nType} from '~/app/ui/i18n-types';
import {
    CHAT_BACKGROUNDS,
    CHAT_BACKGROUND_NONE,
    CHAT_BACKGROUND_RANDOM,
} from '~/app/ui/svelte-components/utils/chat-background';
import type {Theme} from '~/common/dom/ui/theme';
import {unreachable} from '~/common/utils/assert';

/**
 * Returns the corresponding dropdown label for a specific {@link Theme}.
 */
export function getThemeDropdownLabel(theme: Theme, i18n: I18nType): string {
    switch (theme) {
        case 'light':
            return i18n.t('settings--appearance.label--theme-light', 'Light');
        case 'dark':
            return i18n.t('settings--appearance.label--theme-dark', 'Dark');
        case 'system':
            return i18n.t('settings--appearance.label--theme-system', 'System');
        default:
            return unreachable(theme);
    }
}

/**
 * Returns a {@link SettingsDropdown} spec for the theme dropdown.
 */
export function getThemeDropdown(
    i18n: I18nType,
): SettingsDropdown<Record<Theme, string>, Theme, undefined> {
    return {
        updateKey: undefined,
        items: [
            {
                text: getThemeDropdownLabel('light', i18n),
                value: 'light',
            },
            {
                text: getThemeDropdownLabel('dark', i18n),
                value: 'dark',
            },
            {
                text: getThemeDropdownLabel('system', i18n),
                value: 'system',
            },
        ],
    };
}

/**
 * Returns the corresponding dropdown label for a specific {@link Locale}.
 */
export function getLocaleDropdownLabel(locale: Locale): string {
    return LOCALE_NAMES[locale];
}

/**
 * Returns a {@link SettingsDropdown} spec for the theme dropdown.
 */
export function getLocaleDropdown(): SettingsDropdown<Record<Locale, string>, Locale, undefined> {
    return {
        updateKey: undefined,
        items: LOCALES.map((locale) => ({
            text: getLocaleDropdownLabel(locale),
            value: locale,
        })),
    };
}

/**
 * Returns the human-readable label for a chat-background id (a catalog id, or `none`/`random`).
 */
export function getChatBackgroundDropdownLabel(backgroundId: string, i18n: I18nType): string {
    switch (backgroundId) {
        case CHAT_BACKGROUND_NONE:
            return i18n.t('settings--appearance.label--chat-background-none', 'None');
        case CHAT_BACKGROUND_RANDOM:
            return i18n.t('settings--appearance.label--chat-background-random', 'Random per chat');
        default: {
            const background = CHAT_BACKGROUNDS.find((entry) => entry.id === backgroundId);
            // Unknown / removed ids fall back to the "None" label.
            return background === undefined
                ? i18n.t('settings--appearance.label--chat-background-none', 'None')
                : getChatBackgroundName(background.id, i18n);
        }
    }
}

/**
 * Returns the localized display name for a single built-in gradient background.
 */
function getChatBackgroundName(id: string, i18n: I18nType): string {
    // The gradient ids double as i18n key slugs (e.g. `sunset` -> `label--chat-background-sunset`),
    // with the English name as the inline default.
    const fallbacks: Record<string, string> = {
        sunset: 'Sunset',
        ocean: 'Ocean',
        forest: 'Forest',
        lavender: 'Lavender',
        dusk: 'Dusk',
        peach: 'Peach',
        mint: 'Mint',
        berry: 'Berry',
        sky: 'Sky',
        ember: 'Ember',
        candy: 'Candy',
        aqua: 'Aqua',
        lime: 'Lime',
        coral: 'Coral',
        rose: 'Rose',
    };
    return i18n.t(`settings--appearance.label--chat-background-${id}`, fallbacks[id] ?? id);
}

/**
 * Returns a {@link SettingsDropdown} spec for the chat-background dropdown (None, every built-in
 * gradient, and the "random per chat" option).
 */
export function getChatBackgroundDropdown(
    i18n: I18nType,
): SettingsDropdown<Record<string, string>, string, undefined> {
    return {
        updateKey: undefined,
        items: [
            {
                text: getChatBackgroundDropdownLabel(CHAT_BACKGROUND_NONE, i18n),
                value: CHAT_BACKGROUND_NONE,
            },
            {
                text: getChatBackgroundDropdownLabel(CHAT_BACKGROUND_RANDOM, i18n),
                value: CHAT_BACKGROUND_RANDOM,
            },
            ...CHAT_BACKGROUNDS.map((background) => ({
                text: getChatBackgroundName(background.id, i18n),
                value: background.id,
            })),
        ],
    };
}
