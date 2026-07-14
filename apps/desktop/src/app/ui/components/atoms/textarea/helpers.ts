/**
 * The timeout to debounce byte length recounts by.
 */
export const DEBOUNCE_TIMEOUT_TO_RECOUNT_TEXT_BYTES_MILLIS = 1000;

/**
 * The timeout to debounce content-change notifications by. Kept short so content-dependent UI (e.g.
 * the link-preview chip) reacts promptly to typing/paste, while still coalescing rapid keystrokes.
 */
export const DEBOUNCE_TIMEOUT_TO_NOTIFY_CONTENT_CHANGE_MILLIS = 250;
