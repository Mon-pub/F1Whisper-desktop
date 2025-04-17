import {unreachable} from '~/common/utils/assert';

/**
 * Function that suspends a buffered callback queue.
 */
type SuspendFunction = () => void;

/**
 * Function that resumes a buffered callback queue.
 */
type ResumeFunction = (options?: {
    /**
     * Whether to re-execute calls that were suppressed while the queue was suspended. Defaults to
     * `"none"`.
     */
    replay?: 'none' | 'all' | 'last';
}) => void;

/**
 * Makes the given `callbacks` suspendable and resumable.
 *
 * Returns the following three functions, which can be used instead of calling the `callback`
 * directly:
 *
 * - `dispatcher`: Has the same parameter signature as the callback with the given `name`, and adds
 *   the call to the queue. If the queue is suspended, calls will be delayed until the queue is
 *   resumed again. If the queue is not suspended, calls will just be relayed to `callback`
 *   directly.
 * - `suspender`: Suspends relaying of calls to the callback functions and adds them to a queue
 *   instead.
 * - `resumer`: Resumes relaying of calls to the callback functions, and processes (and then clears)
 *   the queue.
 *
 * During suspension, calls will be collected and can optionally be re-sent when the queue is
 * resumed.
 *
 * @param callbacks An object mapping function names to their implementations.
 * @returns A 3-tuple of: dispatch function, suspend function, and resume function.
 */
export function createBufferedDispatcher<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TCallbacks extends Record<string, (...args: any[]) => any>,
>(
    callbacks: TCallbacks,
): [
    dispatch: <TKey extends keyof TCallbacks>(
        type: TKey,
        ...args: Parameters<TCallbacks[TKey]>
    ) => void,
    suspend: SuspendFunction,
    resume: ResumeFunction,
] {
    type Key = keyof TCallbacks;
    let bufferedCalls: [type: Key, parameters: Parameters<TCallbacks[Key]>][] = [];

    let isSuspended = false;

    return [
        // Dispatch function.
        (type, ...args) => {
            if (isSuspended) {
                bufferedCalls.push([type, args]);
                return;
            }

            // If not suspended, the callback can be called directly.
            callbacks[type]?.(...args);
        },
        // Suspend function.
        () => {
            isSuspended = true;
        },
        // Resume function.
        ({replay = 'none'} = {}) => {
            isSuspended = false;

            // Re-execute calls that were buffered while the dispatcher was suspended.
            switch (replay) {
                case 'none':
                    // Don't re-send any buffered calls.
                    break;

                case 'all': {
                    bufferedCalls.forEach(([type, args]) => {
                        callbacks[type]?.(...args);
                    });
                    break;
                }

                case 'last': {
                    const [type, args] = bufferedCalls.at(-1) ?? [];
                    if (type !== undefined && args !== undefined) {
                        callbacks[type]?.(...args);
                    }
                    break;
                }

                default:
                    unreachable(replay);
            }

            // Reset buffered calls.
            bufferedCalls = [];
        },
    ];
}
