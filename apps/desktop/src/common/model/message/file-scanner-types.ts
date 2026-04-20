/**
 * Types for the file scanner extension point.
 *
 * This module defines the shared types used by {@link file-scanner.ts}, an extension point that
 * allows custom builds to integrate security scanning (e.g., antivirus, DLP) for downloaded message
 * attachments.
 *
 * IMPORTANT: The file scanner is a no-op in official Threema builds. Custom build customers may
 * replace `file-scanner.ts` with their own implementation; this types file stays shared and must
 * not be replaced. The security tradeoff between consistent end-to-end encryption and security
 * scanning is left to customers to decide.
 */

/**
 * Verdict returned by {@link scanFile}.
 *
 * - `allow`: File is considered safe and may be stored.
 * - `block`: File must not be stored. `reason` is a human-readable description
 *   (not user-facing translated text) that will be surfaced for logging and
 *   error context.
 */
export type FileScanVerdict =
    | {readonly action: 'allow'}
    | {readonly action: 'block'; readonly reason: string};

export interface FileScanContext {
    readonly mediaType: string;
    /** `createdAt` timestamp of the associated message. */
    readonly messageCreatedAt: Date;
}
