/* eslint-disable @typescript-eslint/naming-convention */

/**
 * Extension point for custom builds: Allows customers to integrate security scanning (e.g.,
 * antivirus, DLP) for downloaded message attachments.
 *
 * This module exposes {@link scanFile}, a hook that is invoked for every decrypted message
 * attachment (main blob, not thumbnail) before it is written to file storage. It allows custom
 * build customers to integrate security scanning software (e.g., antivirus, DLP) into the
 * attachment download path.
 *
 * IMPORTANT: In official Threema builds this function is a no-op, it unconditionally allows every
 * file. Custom build customers may replace this file with their own implementation. The security
 * tradeoff between consistent end-to-end encryption and security scanning is left to the customers
 * to decide.
 *
 * The replacement MUST export a `scanFile` function with the exact same signature. The types in
 * `file-scanner-types.ts` are shared and must not be replaced.
 */

import type {ReadonlyUint8Array} from '~/common/types';

import type {FileScanContext, FileScanVerdict} from './file-scanner-types';

// eslint-disable-next-line @typescript-eslint/require-await
export async function scanFile(
    _data: ReadonlyUint8Array,
    _context: FileScanContext,
): Promise<FileScanVerdict> {
    return {action: 'allow'};
}
