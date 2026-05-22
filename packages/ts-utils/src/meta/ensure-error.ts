/**
 * Ensure a caught error is an actual `Error` instance.
 */
export function ensureError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }
    return new Error(`${error}`);
}
