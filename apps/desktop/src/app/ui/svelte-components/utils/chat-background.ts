/**
 * Built-in catalog of gradient chat backgrounds (ported 1:1 from the F1Whisper Android fork's
 * {@link ch.threema.app.utils.ChatBackgrounds}). Each background is identified by a stable `id`
 * string that is persisted per chat / globally; the gradient itself is rendered as a pure CSS
 * `linear-gradient`, so it adds nothing to the bundle (no image assets).
 *
 * The order is stable and MUST NOT change, because {@link stableChatBackgroundForKey} maps a chat's
 * id onto this list by index — reordering would reshuffle existing chats' "random" backgrounds.
 */

/** A single built-in gradient background. */
export interface ChatBackground {
    /** Stable identifier, persisted to local storage. */
    readonly id: string;
    /** The gradient stop colors, in order, as CSS hex strings. */
    readonly colors: readonly string[];
    /** The gradient direction in degrees (CSS `linear-gradient` angle). */
    readonly angleDegrees: number;
}

/**
 * The built-in gradient catalog (15 gradients). Term- and value-consistent with the Android fork so
 * the same chat shows the same background on both clients when "random per chat" is used.
 */
export const CHAT_BACKGROUNDS: readonly ChatBackground[] = [
    {id: 'sunset', colors: ['#ff7e5f', '#feb47b'], angleDegrees: 45},
    {id: 'ocean', colors: ['#2193b0', '#6dd5ed'], angleDegrees: 45},
    {id: 'forest', colors: ['#11998e', '#38ef7d'], angleDegrees: 45},
    {id: 'lavender', colors: ['#834d9b', '#d04ed6'], angleDegrees: 45},
    {id: 'dusk', colors: ['#355c7d', '#6c5b7b', '#c06c84'], angleDegrees: 45},
    {id: 'peach', colors: ['#ff9a8b', '#ff6a88', '#ff99ac'], angleDegrees: 45},
    {id: 'mint', colors: ['#00b09b', '#96c93d'], angleDegrees: 45},
    {id: 'berry', colors: ['#c94b4b', '#4b134f'], angleDegrees: 45},
    {id: 'sky', colors: ['#1fa2ff', '#12d8fa', '#a6ffcb'], angleDegrees: 45},
    {id: 'ember', colors: ['#f12711', '#f5af19'], angleDegrees: 45},
    // Sourced from Telegram's built-in animated gradient wallpapers.
    {id: 'candy', colors: ['#837cff', '#b063ff', '#ff72a9', '#e269ff'], angleDegrees: 45},
    {id: 'aqua', colors: ['#4d8dff', '#2bbfff', '#20e2cd', '#0ee1f1'], angleDegrees: 45},
    {id: 'lime', colors: ['#00d2d5', '#09e279', '#c7ef60', '#6dd957'], angleDegrees: 45},
    {id: 'coral', colors: ['#ff7866', '#ff82a5', '#feb055', '#ff8e51'], angleDegrees: 45},
    {id: 'rose', colors: ['#f94ba0', '#fb5c80', '#ffb23a', '#fe7e62'], angleDegrees: 45},
] as const;

/**
 * Sentinel id meaning "no gradient background" (use the app's default flat background). Stored when
 * the user explicitly turns the background off.
 */
export const CHAT_BACKGROUND_NONE = 'none' as const;

/**
 * Sentinel id meaning "pick a stable random background per chat" (deterministic per conversation,
 * not stored per chat). Mirrors Android's `stableForUid`.
 */
export const CHAT_BACKGROUND_RANDOM = 'random' as const;

/**
 * Look up a built-in background by id. Returns `undefined` for an unknown id or the `none`/`random`
 * sentinels.
 */
export function chatBackgroundById(id: string | undefined): ChatBackground | undefined {
    if (id === undefined) {
        return undefined;
    }
    return CHAT_BACKGROUNDS.find((background) => background.id === id);
}

/**
 * Deterministically map a conversation's key (e.g. its uid string) to one of the built-in
 * backgrounds, so an existing chat gets a varied-but-stable background without storing anything per
 * chat. Mirrors Android's `ChatBackgrounds.stableForUid` (same hash, same modulo, same ordering).
 */
export function stableChatBackgroundForKey(key: string): ChatBackground {
    // Java `String.hashCode` parity, so the same conversation lands on the same gradient on both
    // clients.
    let hash = 0;
    for (let index = 0; index < key.length; index++) {
        // eslint-disable-next-line no-bitwise
        hash = (Math.imul(31, hash) + key.charCodeAt(index)) | 0;
    }
    const moduloIndex = Math.abs(hash) % CHAT_BACKGROUNDS.length;
    // `CHAT_BACKGROUNDS` is non-empty, so this index is always valid.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return CHAT_BACKGROUNDS[moduloIndex]!;
}

/**
 * Build the CSS `linear-gradient(...)` value for a background, or `undefined` when there is no
 * gradient to render (the `none` sentinel / an unknown id).
 *
 * @param backgroundId The stored background id (a catalog id, or `none`/`random`).
 * @param conversationKey A stable per-conversation key, used to resolve the `random` sentinel.
 */
export function resolveChatBackgroundGradient(
    backgroundId: string | undefined,
    conversationKey: string,
): string | undefined {
    if (backgroundId === undefined || backgroundId === CHAT_BACKGROUND_NONE) {
        return undefined;
    }

    const background =
        backgroundId === CHAT_BACKGROUND_RANDOM
            ? stableChatBackgroundForKey(conversationKey)
            : chatBackgroundById(backgroundId);

    if (background === undefined) {
        return undefined;
    }

    return `linear-gradient(${background.angleDegrees}deg, ${background.colors.join(', ')})`;
}
