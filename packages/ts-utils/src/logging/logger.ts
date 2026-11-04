/**
 * Log function to log a record for a specific level.
 */
export type LogRecordFn = (...data: readonly unknown[]) => void;

/**
 * A minimal structural logger interface, containing the log functions that are compatible with
 * `console`.
 */
export interface Logger {
    // Log functions, compatible with `console`
    readonly trace: LogRecordFn;
    readonly debug: LogRecordFn;
    readonly info: LogRecordFn;
    readonly warn: LogRecordFn;
    readonly error: LogRecordFn;
}
