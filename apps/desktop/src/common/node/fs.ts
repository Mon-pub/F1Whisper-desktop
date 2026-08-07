/**
 * File-system related functionality.
 */

import {S_IRGRP, S_IRUSR, S_IWUSR, S_IXGRP, S_IXUSR} from 'node:constants';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import * as process from 'node:process';

export type ModeOrEmpty = {mode: number} | Record<string, never>;

/**
 * Permission for potentially sensitive directories: 0750.
 *
 * Warning: Support on Windows is missing!
 */
const MODE_DIRECTORY_INTERNAL =
    // eslint-disable-next-line no-bitwise
    S_IRUSR | S_IWUSR | S_IXUSR | S_IRGRP | S_IXGRP;

/**
 * On a POSIX system, this will return an object with the `mode` set to
 * {@link MODE_DIRECTORY_INTERNAL}. On Windows, an empty object is returned.
 */
export function directoryModeInternalObjectIfPosix(): ModeOrEmpty {
    return process.platform === 'win32' ? {} : {mode: MODE_DIRECTORY_INTERNAL};
}

/**
 * Permission for potentially sensitive files: 0600.
 *
 * Warning: Support on Windows is only partial, or missing completely!
 * See https://github.com/nodejs/node/pull/42757.
 */
// eslint-disable-next-line no-bitwise
const MODE_FILE_INTERNAL = S_IRUSR | S_IWUSR;

/**
 * On a POSIX system, this will return an object with the `mode` set to {@link MODE_FILE_INTERNAL}.
 * On Windows, an empty object is returned.
 */
export function fileModeInternalObjectIfPosix(): ModeOrEmpty {
    return process.platform === 'win32' ? {} : {mode: MODE_FILE_INTERNAL};
}

/**
 * On a POSIX system, this will return {@link MODE_FILE_INTERNAL}.
 * On Windows, undefined is returned.
 */

export function fileModeInternalIfPosix(): number | undefined {
    return process.platform === 'win32' ? undefined : MODE_FILE_INTERNAL;
}

/**
 * Options for {@link writeFileAtomically}.
 */
export interface AtomicWriteOptions {
    /** File mode for the created file (POSIX only; ignored on Windows). */
    readonly mode?: number;
    /**
     * If set, the current target file (when it exists) is copied to this path before it is replaced,
     * so a recoverable previous copy is retained across the write.
     */
    readonly backupPath?: string;
}

/**
 * Best-effort flush of a directory entry so that a rename inside it survives a crash. Not supported
 * on every platform/filesystem (notably Windows), where it is a no-op; the atomic rename itself still
 * provides the core crash-safety guarantee.
 */
async function syncDirectory(directoryPath: string): Promise<void> {
    let handle: fsPromises.FileHandle | undefined;
    try {
        handle = await fsPromises.open(directoryPath, 'r');
        await handle.sync();
    } catch {
        // Directory fsync is best-effort.
    } finally {
        await handle?.close().catch(() => {
            // Ignore close errors on the best-effort directory handle.
        });
    }
}

/**
 * Write `bytes` to `filePath` crash-safely.
 *
 * The bytes are first written to a same-directory temporary file and flushed to disk (`fsync`); an
 * optional backup of the current target is taken; only then is the temporary file atomically renamed
 * over the target. A crash or power loss at any point therefore leaves either the fully-intact
 * previous file (or its backup) or the fully-written new file, never a truncated/partially-written
 * target. A plain `writeFile` to the destination can, by contrast, truncate then partially write,
 * leaving an unreadable file if interrupted.
 *
 * @throws if the temporary write, backup, or rename fails (the temporary file is cleaned up first).
 */
export async function writeFileAtomically(
    filePath: string,
    bytes: Uint8Array,
    options: AtomicWriteOptions = {},
): Promise<void> {
    const temporaryPath = `${filePath}.tmp`;
    try {
        // 1. Write the new bytes to a same-directory temporary file and flush them to disk.
        let handle: fsPromises.FileHandle | undefined;
        try {
            handle = await fsPromises.open(temporaryPath, 'w', options.mode);
            await handle.writeFile(bytes);
            await handle.sync();
        } finally {
            await handle?.close();
        }

        // 2. Retain a recoverable copy of the current target (if any) before replacing it.
        if (options.backupPath !== undefined) {
            try {
                await fsPromises.copyFile(filePath, options.backupPath);
            } catch (error) {
                // A missing target simply means there is nothing to back up (first write).
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
        }

        // 3. Atomically replace the target with the fully-written temporary file.
        await fsPromises.rename(temporaryPath, filePath);
    } catch (error) {
        // Clean up the temporary file so a failed write leaves no partial artifact behind. The
        // target itself was never opened for writing, so it remains fully intact.
        await fsPromises.rm(temporaryPath, {force: true}).catch(() => {
            // Best-effort cleanup.
        });
        throw error;
    }

    // 4. Best-effort: flush the directory entry so the rename survives a crash.
    await syncDirectory(path.dirname(filePath));
}
