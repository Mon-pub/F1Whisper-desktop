import * as fs from 'node:fs';
import path from 'node:path';

import {STATIC_CONFIG} from '~/common/config';
import type {Logger} from '~/common/logging';

/**
 * Returns the path to the `electron.safeStorage` password file in the given `profileDirectoryPath`.
 * Important: The path is not validated, so it might not exist.
 *
 * @param profileDirectoryPath Path to the Threema profile directory to use as the base path.
 */
export function getSafeStoragePasswordPath(profileDirectoryPath: string): string {
    return path.join(profileDirectoryPath, ...STATIC_CONFIG.SAFE_STORAGE_PASSWORD_PATH);
}

/**
 * Deletes the password file for `electron.safeStorage` in the given `profileDirectoryPath`, if it
 * exists. Otherwise, this is a no-op, and will not throw.
 */
export function deleteSafeStoragePasswordFile(profileDirectoryPath: string, log?: Logger): void {
    const safeStoragePasswordPath = getSafeStoragePasswordPath(profileDirectoryPath);

    try {
        fs.unlinkSync(safeStoragePasswordPath);
        log?.info(`Password file '${safeStoragePasswordPath}' deleted`);
    } catch {
        log?.info(`Password file '${safeStoragePasswordPath}' does NOT exist`);
    }
}
