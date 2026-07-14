/**
 * A tiny process-wide registry for the "restore/show the main window" action.
 *
 * On Windows/Linux the app closes to the system tray (the window is hidden, not destroyed), so a
 * mere `window.focus()` from a notification click cannot bring the window back — it needs a
 * main-process `show()` via IPC. That IPC lives on the {@link ElectronIpcService}, which is
 * constructed at app boot; it registers its `showWindow` here so unrelated renderer code (e.g. the
 * notification handler) can trigger a window restore without taking a direct dependency on the
 * Electron service or being wired through a constructor.
 *
 * No-op when unset (e.g. non-Electron test contexts).
 */

let showWindowHandler: (() => void) | undefined;

/**
 * Register the handler that shows/focuses the main window. Called once by the Electron IPC service.
 */
export function registerShowWindowHandler(handler: () => void): void {
    showWindowHandler = handler;
}

/**
 * Request the main window to be shown/focused. No-op if no handler has been registered.
 */
export function requestShowWindow(): void {
    showWindowHandler?.();
}
