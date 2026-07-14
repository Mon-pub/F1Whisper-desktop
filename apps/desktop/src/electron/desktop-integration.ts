import {execFile} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as process from 'node:process';

// eslint-disable-next-line import/no-extraneous-dependencies
import * as electron from 'electron';

import type {Logger} from '~/common/logging';
import {ensureError} from '~/common/utils/assert';

/**
 * Wayland icon integration for Linux.
 *
 * Under Wayland, the `BrowserWindow` `icon:` option (an X11-only mechanism) is ignored: the
 * compositor instead resolves a window's icon by matching the window `app_id` to an installed
 * `.desktop` file of the same basename and reading its `Icon=` entry. This module writes a per-user
 * `.desktop` file plus the icon so that F1Whisper shows its real icon under Wayland (GNOME/KDE), the
 * taskbar, and the app launcher.
 *
 * Icon resolution is deliberately made robust against the fragile theme/cache lookup chain (which on
 * Plasma 6 broke the taskbar even though the titlebar resolved fine): the `.desktop` `Icon=` entry
 * points at an **absolute path** to the installed PNG. The desktop-entry spec explicitly permits an
 * absolute path for `Icon=`, and using one bypasses the icon-theme lookup entirely — no
 * `index.theme`, no size-directory matching, no `gtk-update-icon-cache` / `kbuildsycoca` freshness
 * required. We still additionally install name-based themed copies at several standard sizes as a
 * fallback for the minority of launchers that only honor themed icon names.
 *
 * All operations are best-effort and idempotent: the `.desktop` file is only rewritten when its
 * content (notably the absolute `Exec`/`Icon` paths) changed, and any error is caught and logged as
 * a warning so a failure here can never crash startup.
 *
 * Note: The reverse-domain-notation app id must match `determineAppRdn('custom-onprem',
 * 'F1Whisper')` from `config/base.js` (`ch.f1whisper.f1whisper-desktop`), which is also passed to
 * `app.setDesktopName(...)` and set as the window `StartupWMClass` — the three must agree for the
 * compositor to associate the window with this entry.
 */

/**
 * Reverse-domain-notation application id for the `custom-onprem` (F1Whisper) flavor.
 *
 * Must stay in sync with `determineAppRdn('custom-onprem', <appName='F1Whisper'>)` in
 * `apps/desktop/config/base.js`, which is not available to the main process at runtime (not exposed
 * via `import.meta.env`), so it is duplicated here as a constant.
 */
export const LINUX_APP_ID = 'ch.f1whisper.f1whisper-desktop';

/**
 * The `.desktop` file basename the compositor looks up (app id + `.desktop`).
 */
export const LINUX_DESKTOP_FILE_NAME = `${LINUX_APP_ID}.desktop`;

/**
 * Standard square icon sizes to install into the hicolor theme (in addition to the absolute-path
 * `Icon=` entry). The bundled source PNG is 512×512, so 512 is a straight copy and the smaller sizes
 * are downscaled from it.
 */
const LINUX_ICON_SIZES = [128, 256, 512] as const;

/**
 * Run a desktop-database/icon-cache refresh helper, ignoring any failure (the helper may be absent
 * on minimal systems, which is fine — the entries are still valid on next login).
 */
function refreshCache(command: string, args: readonly string[], log: Logger): void {
    execFile(command, [...args], (error) => {
        if (error !== null) {
            log.debug(`Desktop integration: '${command}' not run (${error.message})`);
        }
    });
}

/**
 * Install the app icon into the hicolor theme at each of {@link LINUX_ICON_SIZES}. The 512×512 copy
 * is a straight copy of the (512px) source bytes; smaller sizes are downscaled with a good filter.
 * Returns whether any file was (re)written.
 *
 * The 512×512 copy is installed first because it is the target of the absolute-path `Icon=` entry: a
 * later smaller-size failure must not leave `Icon=` pointing at a missing file. If the source PNG
 * fails to decode, only the 512 copy (a straight byte copy) is written and the smaller sizes are
 * skipped — writing the raw 512px bytes into the `128x128`/`256x256` directories would corrupt the
 * size-indexed theme.
 */
function installHicolorIcons(
    hicolorDir: string,
    iconBytes: Buffer,
    log: Logger,
): boolean {
    function iconPathForSize(size: number): string {
        return path.join(hicolorDir, `${size}x${size}`, 'apps', `${LINUX_APP_ID}.png`);
    }

    // The source PNG is 512px, so the 512 copy is always a straight byte copy (installed first).
    let wrote = writeIfChanged(iconPathForSize(512), iconBytes, log);

    const sourceImage = electron.nativeImage.createFromBuffer(iconBytes);
    if (sourceImage.isEmpty()) {
        log.warn('Desktop integration: icon decode failed; installed 512px copy only');
        return wrote;
    }
    for (const size of LINUX_ICON_SIZES) {
        if (size === 512) {
            continue;
        }
        const bytes = sourceImage.resize({width: size, height: size, quality: 'best'}).toPNG();
        if (writeIfChanged(iconPathForSize(size), bytes, log)) {
            wrote = true;
        }
    }
    return wrote;
}

/**
 * Write a file only if its content differs from what is already on disk. Returns whether a write
 * happened.
 */
function writeIfChanged(filePath: string, content: string | Buffer, log: Logger): boolean {
    try {
        if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath);
            const next = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
            if (existing.equals(next)) {
                return false;
            }
        }
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        fs.writeFileSync(filePath, content);
        return true;
    } catch (error) {
        log.warn(
            `Desktop integration: failed to write ${filePath}: ${ensureError(error).message}`,
        );
        return false;
    }
}

/**
 * Idempotently install a per-user `.desktop` file and themed icon so that the Wayland compositor
 * (and the app launcher) resolve F1Whisper's real icon and window class.
 *
 * This is a no-op on non-Linux platforms and in development (when the app runs from a source tree,
 * `process.execPath` is the Electron binary, not the packaged launcher, so we would install a
 * broken `Exec` line).
 *
 * @param appName Display name (`import.meta.env.APP_NAME`).
 * @param iconSourcePath Absolute path to the bundled 512×512 PNG (packaged `resourcesPath` icon).
 * @param isPackaged Whether the app is running packaged (`app.isPackaged`).
 * @param log Logger.
 */
export function installLinuxDesktopIntegration(
    appName: string,
    iconSourcePath: string,
    isPackaged: boolean,
    log: Logger,
): void {
    if (process.platform !== 'linux') {
        return;
    }
    // Only install for a real packaged run: a dev run's `execPath` points at the Electron binary,
    // which would produce a `.desktop` file that does not launch F1Whisper.
    if (!isPackaged) {
        log.debug('Desktop integration: skipping (not a packaged run)');
        return;
    }

    try {
        const dataHome =
            process.env.XDG_DATA_HOME !== undefined && process.env.XDG_DATA_HOME !== ''
                ? process.env.XDG_DATA_HOME
                : path.join(os.homedir(), '.local', 'share');

        const applicationsDir = path.join(dataHome, 'applications');
        const desktopFilePath = path.join(applicationsDir, LINUX_DESKTOP_FILE_NAME);
        const hicolorDir = path.join(dataHome, 'icons', 'hicolor');

        // Install the icon into the hicolor theme at several standard sizes. The 512×512 copy is also
        // the target of the absolute-path `Icon=` entry below (which is what actually makes the icon
        // resolve reliably); the other sizes are a fallback for themed-name-only launchers.
        let wroteIcon = false;
        const primaryIconPath = path.join(hicolorDir, '512x512', 'apps', `${LINUX_APP_ID}.png`);
        try {
            if (fs.existsSync(iconSourcePath)) {
                wroteIcon = installHicolorIcons(hicolorDir, fs.readFileSync(iconSourcePath), log);
            } else {
                log.warn(`Desktop integration: icon source not found at ${iconSourcePath}`);
            }
        } catch (error) {
            log.warn(
                `Desktop integration: failed to install icon: ${ensureError(error).message}`,
            );
        }

        // Absolute path to the launcher executable, quoted for the `Exec=` field.
        const execPath = process.execPath;

        // Choose the `Icon=` value. Prefer the ABSOLUTE path to the installed 512px PNG: the spec
        // allows an absolute path, and it bypasses the icon-theme/cache lookup that broke the Plasma 6
        // Wayland taskbar (the themed name resolved for the titlebar but not the Task Manager applet).
        //
        // Fall back to the themed icon name (resolved from the hicolor copies installed above) when
        // either the absolute path cannot be used reliably: the `Icon=` field has no escaping in the
        // spec, so a whitespace-containing path (e.g. a home directory with a space) would be
        // misparsed; and if the 512px file is missing (its install failed) an absolute path would
        // point at nothing.
        const canUseAbsoluteIconPath =
            !/\s/u.test(primaryIconPath) && fs.existsSync(primaryIconPath);
        const iconValue = canUseAbsoluteIconPath ? primaryIconPath : LINUX_APP_ID;

        // Desktop-entry spec: https://specifications.freedesktop.org/desktop-entry-spec/latest/
        // `StartupWMClass` must match the window `app_id` so the compositor associates the running
        // window with this entry.
        const desktopFileContent = `${[
            '[Desktop Entry]',
            'Type=Application',
            `Name=${appName}`,
            `Exec="${execPath}" %U`,
            `Icon=${iconValue}`,
            'Terminal=false',
            `StartupWMClass=${LINUX_APP_ID}`,
            'Categories=Network;InstantMessaging;',
        ].join('\n')}\n`;

        const wroteDesktopFile = writeIfChanged(desktopFilePath, desktopFileContent, log);

        if (wroteDesktopFile || wroteIcon) {
            log.info(
                `Desktop integration installed (desktop file: ${wroteDesktopFile}, icon: ${wroteIcon})`,
            );
            // Best-effort cache refreshes so the entry/icon show up without a re-login.
            if (wroteDesktopFile) {
                refreshCache('update-desktop-database', [applicationsDir], log);
                // KDE Plasma caches desktop-file metadata in its sycoca database; without a rebuild
                // it can keep serving a stale entry (or none). Try the Plasma 6 helper first, then
                // fall back to the Plasma 5 one. Both are best-effort and ignored if absent.
                refreshCache('kbuildsycoca6', ['--noincremental'], log);
                refreshCache('kbuildsycoca5', ['--noincremental'], log);
            }
            if (wroteIcon) {
                refreshCache('gtk-update-icon-cache', ['-f', '-t', hicolorDir], log);
            }
        } else {
            log.debug('Desktop integration already up to date');
        }
    } catch (error) {
        log.warn(`Desktop integration failed: ${ensureError(error).message}`);
    }
}
