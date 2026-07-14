import * as fs from 'node:fs';
import * as process from 'node:process';

// eslint-disable-next-line import/no-extraneous-dependencies
import * as electron from 'electron';

import type {TrayLabels} from '~/common/electron-ipc';
import type {Logger} from '~/common/logging';
import {ensureError} from '~/common/utils/assert';

/**
 * English defaults for the tray context menu. Sent from the renderer (where i18n lives) via the
 * {@link ElectronIpcCommand.SET_TRAY_LABELS} IPC once i18n is ready (and again on locale change),
 * so these defaults are only shown for the brief window before the first message arrives.
 */
const DEFAULT_TRAY_LABELS: TrayLabels = {
    open: 'Open',
    quit: 'Quit',
};

/**
 * On some GNOME/Wayland setups a restored window is not raised above others. Toggling
 * always-on-top around a focus nudges it to the front. Harmless on other platforms.
 */
function focusAndForceToTop(window: electron.BrowserWindow): void {
    window.setAlwaysOnTop(true);
    window.focus();
    window.setAlwaysOnTop(false);
}

/**
 * A system tray icon with a context menu ("Open" / "Quit"), used on Windows and Linux so that
 * closing the window (which merely hides it — see the window `close` handler) leaves a way back to
 * the app and a way to really quit it.
 *
 * macOS keeps the Dock convention and does not create a tray.
 *
 * The tray icon image is built from the bundled 512×512 PNG (the Windows `.ico` files are only used
 * at packaging time and are not shipped inside the packaged app, so we use one PNG source for both
 * platforms). The context-menu labels are localized: the menu is (re)built whenever new labels
 * arrive over IPC, and clicking the tray icon (Windows) or its menu entries shows/quits the app.
 */
export class AppTray {
    private _tray: electron.Tray | undefined;
    private _labels: TrayLabels = DEFAULT_TRAY_LABELS;

    public constructor(
        private readonly _iconSourcePath: string,
        private readonly _tooltip: string,
        private readonly _getWindow: () => electron.BrowserWindow | undefined,
        private readonly _onQuit: () => void,
        private readonly _log: Logger,
    ) {}

    /**
     * Whether the underlying `electron.Tray` was actually created. `false` on macOS (no tray) and
     * on a trayless Linux session where `Tray` construction fails (e.g. no libappindicator /
     * status-notifier host). Callers use this to avoid hiding the window with no visible way back.
     */
    public get isCreated(): boolean {
        return this._tray !== undefined;
    }

    /**
     * Create the tray icon and its context menu. No-op on macOS or if already created.
     */
    public create(): void {
        if (process.platform === 'darwin' || this._tray !== undefined) {
            return;
        }

        let image: electron.NativeImage;
        try {
            const buffer = fs.readFileSync(this._iconSourcePath);
            image = electron.nativeImage.createFromBuffer(buffer);
            if (image.isEmpty()) {
                this._log.warn(`Tray icon image is empty (source: ${this._iconSourcePath})`);
            }
        } catch (error) {
            this._log.warn(
                `Failed to load tray icon from ${this._iconSourcePath}: ${ensureError(error).message}`,
            );
            image = electron.nativeImage.createEmpty();
        }

        try {
            this._tray = new electron.Tray(image);
        } catch (error) {
            this._log.warn(`Failed to create tray: ${ensureError(error).message}`);
            this._tray = undefined;
            return;
        }

        this._tray.setToolTip(this._tooltip);

        // Note: on Linux with an AppIndicator, the 'click' event is often ignored, so the context
        // menu is the reliable way to interact with the tray. On Windows, clicking shows the window.
        this._tray.on('click', () => this._showWindow());

        this._rebuildMenu();
        this._log.info('Tray icon created');
    }

    /**
     * Update the localized context-menu labels and rebuild the menu.
     */
    public setLabels(labels: TrayLabels): void {
        this._labels = labels;
        this._rebuildMenu();
    }

    /**
     * Show and focus the main window (used by the tray, and reused by the SHOW_WINDOW IPC).
     */
    public showWindow(): void {
        this._showWindow();
    }

    /**
     * Destroy the tray icon (if any). Electron destroys it automatically on quit, so this is only
     * needed for explicit teardown.
     */
    public destroy(): void {
        this._tray?.destroy();
        this._tray = undefined;
    }

    private _showWindow(): void {
        const window = this._getWindow();
        if (window === undefined) {
            return;
        }
        if (window.isMinimized()) {
            window.restore();
        }
        window.show();
        focusAndForceToTop(window);
    }

    private _rebuildMenu(): void {
        if (this._tray === undefined) {
            return;
        }
        const menu = electron.Menu.buildFromTemplate([
            {
                label: this._labels.open,
                click: () => this._showWindow(),
            },
            {
                label: this._labels.quit,
                click: () => this._onQuit(),
            },
        ]);
        this._tray.setContextMenu(menu);
    }
}
