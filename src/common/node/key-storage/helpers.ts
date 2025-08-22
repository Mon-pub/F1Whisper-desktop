import * as fs from 'node:fs';
import path from 'node:path';

import {STATIC_CONFIG} from '~/common/config';

/**
 * Returns the path to the (current-generation) key storage file in the given
 * `profileDirectoryPath`. Important: The path is not validated, so it might not exist.
 *
 * Note: To retrieve the path to the key storage file of the old generation, use
 * {@link getDeprecatedKeyStoragePath}.
 *
 * @param profileDirectoryPath Path to the Threema profile directory to use as the base path.
 */
export function getKeyStoragePath(profileDirectoryPath: string): string {
    return path.join(profileDirectoryPath, ...STATIC_CONFIG.KEY_STORAGE_PATH);
}

/**
 * Returns the path to the deprecated key storage file in the given `profileDirectoryPath`.
 * Important: The path is not validated, so it might not exist.
 *
 * Note: To retrieve the path to the key storage file of the latest generation, use
 * {@link getKeyStoragePath}.
 *
 * @param profileDirectoryPath Path to the Threema profile directory to use as the base path.
 * @deprecated
 */
export function getDeprecatedKeyStoragePath(profileDirectoryPath: string): string {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return path.join(profileDirectoryPath, ...STATIC_CONFIG.DEPRECATED_KEY_STORAGE_PATH);
}

/**
 * Returns whether a (current-generation) key storage file exists in the expected location inside
 * the given `profileDirectoryPath`.
 *
 * @param profileDirectoryPath Path to the Threema profile directory to check inside of.
 */
export function getIsKeyStorageFilePresent(profileDirectoryPath: string): boolean {
    return fs.existsSync(getKeyStoragePath(profileDirectoryPath));
}

/**
 * Returns whether a deprecated key storage file exists in the expected location inside the given
 * `profileDirectoryPath`.
 *
 * @param profileDirectoryPath Path to the Threema profile directory to check inside of.
 */
export function getIsDeprecatedKeyStorageFilePresent(profileDirectoryPath: string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return fs.existsSync(getDeprecatedKeyStoragePath(profileDirectoryPath));
}

/**
 * Returns whether any key storage file exists in the expected location inside the given
 * `profileDirectoryPath`, regardless of whether it's of the current or deprecated generation.
 *
 * @param profileDirectoryPath Path to the Threema profile directory to check inside of.
 */
export function getIsAnyKeyStorageFilePresent(profileDirectoryPath: string): boolean {
    return (
        getIsKeyStorageFilePresent(profileDirectoryPath) ||
        getIsDeprecatedKeyStorageFilePresent(profileDirectoryPath)
    );
}
