// Local storage keys
//
// Note: The local storage keys need to be in sync with the critical JS in
//       index.html

import {ensureLocale, isLocale, type Locale} from '~/app/ui/i18n';
import {
    type DebugPanelState,
    ensureDebugPanelHeight,
    ensureDebugPanelState,
} from '~/common/dom/ui/debug';
import {applyTheme, ensureTheme, type Theme} from '~/common/dom/ui/theme';
import {type IWritableStore, WritableStore} from '~/common/utils/store';

const KEYS = {
    theme: 'theme',
    locale: 'locale',
    debugPanelState: 'debug-panel-state',
    debugPanelHeight: 'debug-panel-height',
    chatBackground: 'chat-background',
    chatBackgroundOverrides: 'chat-background-overrides',
} as const;

/**
 * The global default chat-background id (a {@link CHAT_BACKGROUNDS} id, or the `none`/`random`
 * sentinels). A per-conversation override map keyed by the conversation's uid string.
 */
export type ChatBackgroundOverrides = Readonly<Record<string, string>>;

/**
 * Parse the per-conversation chat-background override map from local storage. Tolerant of malformed
 * data (returns an empty map), since this is a non-critical UI preference.
 */
function parseChatBackgroundOverrides(raw: string | undefined): ChatBackgroundOverrides {
    if (raw === undefined || raw === '') {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) {
            return {};
        }
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                result[key] = value;
            }
        }
        return result;
    } catch {
        return {};
    }
}

/**
 * Local storage controller.
 *
 * IMPORTANT: This storage is not encrypted!
 */
export class LocalStorageController {
    public readonly debugPanelState: IWritableStore<DebugPanelState>;
    public readonly debugPanelHeight: IWritableStore<string>;
    public readonly theme: IWritableStore<Theme>;
    public readonly locale: IWritableStore<Locale>;
    /** Global default chat-background id (catalog id, or `none` / `random`). */
    public readonly chatBackground: IWritableStore<string>;
    /** Per-conversation chat-background overrides, keyed by conversation uid string. */
    public readonly chatBackgroundOverrides: IWritableStore<ChatBackgroundOverrides>;

    public constructor(containers: HTMLElement[], systemLocale: string) {
        // Note: We can ignore the unsubscribers because we will also maintain a reference to the
        // store for the lifetime of this instance. Moreover, this instance should be used like a
        // singleton.
        //
        // TODO(DESK-1081): Remove the smelly singleton class, move it to `globals` and make it an
        // object.

        // Debug panel
        this.debugPanelState = new WritableStore(
            ensureDebugPanelState(localStorage.getItem(KEYS.debugPanelState) ?? ''),
        );
        this.debugPanelState.subscribe((state) =>
            localStorage.setItem(KEYS.debugPanelState, state),
        );
        this.debugPanelHeight = new WritableStore(
            ensureDebugPanelHeight(localStorage.getItem(KEYS.debugPanelHeight) ?? ''),
        );
        this.debugPanelHeight.subscribe((height) =>
            localStorage.setItem(KEYS.debugPanelHeight, height),
        );

        // Theme
        this.theme = new WritableStore(ensureTheme(localStorage.getItem(KEYS.theme) ?? ''));
        this.theme.subscribe((theme) => {
            localStorage.setItem(KEYS.theme, theme);
            for (const container of containers) {
                applyTheme(theme, container);
            }
        });

        // Locale
        this.locale = new WritableStore(
            ensureLocale(localStorage.getItem(KEYS.locale) ?? systemLocale),
        );
        this.locale.subscribe((locale) => {
            if (isLocale(locale)) {
                localStorage.setItem(KEYS.locale, locale);
            }
        });

        // Chat background (global default + per-conversation overrides). Pure UI preference, so it
        // lives here next to theme/locale rather than in the encrypted settings model.
        this.chatBackground = new WritableStore(
            localStorage.getItem(KEYS.chatBackground) ?? 'none',
        );
        this.chatBackground.subscribe((background) => {
            localStorage.setItem(KEYS.chatBackground, background);
        });
        this.chatBackgroundOverrides = new WritableStore(
            parseChatBackgroundOverrides(
                localStorage.getItem(KEYS.chatBackgroundOverrides) ?? undefined,
            ),
        );
        this.chatBackgroundOverrides.subscribe((overrides) => {
            localStorage.setItem(KEYS.chatBackgroundOverrides, JSON.stringify(overrides));
        });
    }
}
