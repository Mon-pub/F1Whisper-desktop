import * as os from 'node:os';
import path from 'node:path';
import * as process from 'node:process';

// eslint-disable-next-line import/no-extraneous-dependencies
import * as electron from 'electron';

import type {ScreenSharingReminderDetails, ScreenSharingSource} from '~/common/electron-ipc';
import {ScreenSharingReminderIpcCommand} from '~/common/enum';
import {assert, unreachable} from '~/common/utils/assert';

/**
 * Return the path to the platform-specific application data base directory.
 *
 * - Linux / BSD: $XDG_DATA_HOME/ThreemaDesktop/ or ~/.local/share/ThreemaDesktop/
 * - macOS: ~/Library/Application Support/ThreemaDesktop/
 * - Windows: %APPDATA%/ThreemaDesktop/
 * - Other: ~/.ThreemaDesktop/
 */
export function getPersistentAppDataBaseDir(): string[] {
    const rootDirectoryName = 'ThreemaDesktop';
    switch (process.platform) {
        case 'linux':
        case 'freebsd':
        case 'netbsd':
        case 'openbsd':
        case 'sunos': {
            // Note: Don't use dot notation below, see https://stackoverflow.com/a/72403165/284318
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const XDG_DATA_HOME = (process.env['XDG_DATA_HOME'] ?? '').trim();
            if (XDG_DATA_HOME.length > 0) {
                return [XDG_DATA_HOME, rootDirectoryName];
            }
            return [os.homedir(), '.local', 'share', rootDirectoryName];
        }
        case 'darwin':
            return [os.homedir(), 'Library', 'Application Support', rootDirectoryName];
        case 'win32': {
            // Note: Don't use dot notation below, see https://stackoverflow.com/a/72403165/284318
            // eslint-disable-next-line @typescript-eslint/dot-notation
            const appData = process.env['APPDATA'];
            assert(appData !== undefined && appData !== '', '%APPDATA% is undefined or empty');
            return [appData, rootDirectoryName];
        }
        case 'aix':
        case 'android':
        case 'cygwin':
        case 'haiku':
            return [os.homedir(), `.${rootDirectoryName}`];
        default:
            return unreachable(process.platform);
    }
}

export async function showScreenSharingReminder(
    appUrl: string,
    text: string,
    label: string,
): Promise<electron.BrowserWindow> {
    const display = electron.screen.getPrimaryDisplay();
    const width = 512;
    const browserWindow = new electron.BrowserWindow({
        width,
        height: 2 * 40 + 2 * 8,
        resizable: false,
        frame: false,
        transparent: true,
        x: (display.bounds.width - width) / 2,
        y: 0,
        webPreferences: {
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            preload: path.join(__dirname, '..', 'screenshare-preload', 'screenshare-preload.cjs'),
            webSecurity: true,
            allowRunningInsecureContent: false,
            webgl: false,
            plugins: false,
            experimentalFeatures: false,
            disableBlinkFeatures: [].join(','),
            contextIsolation: true,
            webviewTag: false,
            navigateOnDragDrop: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            enableWebSQL: false,
        },
    });

    return await browserWindow.loadURL(`${appUrl}screenshare.html`).then(() => {
        browserWindow.setAlwaysOnTop(true, 'floating');
        const details: ScreenSharingReminderDetails = {text, label};
        browserWindow.webContents.send(ScreenSharingReminderIpcCommand.SET_DETAILS, details);
        return browserWindow;
    });
}

export function mapToScreenSharingSources(
    sources: electron.DesktopCapturerSource[],
): ScreenSharingSource[] {
    return sources.map((source) => ({
        appIcon:
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            source.appIcon !== null && !source.appIcon.isEmpty()
                ? source.appIcon.toDataURL()
                : undefined,
        id: source.id,
        name: source.name,
        isScreen: source.id.startsWith('screen'),
        thumbnail: source.thumbnail.toDataURL(),
    }));
}
