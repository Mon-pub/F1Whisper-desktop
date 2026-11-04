import {unreachable} from '../meta/unreachable.js';

/**
 * Variant of a {@link DelayedError}.
 */
export type DelayedErrorType = 'get' | 'set';

/**
 * Error when unwrapping too early or setting a {@link Delayed} more than once.
 */
export class DelayedError extends Error {
    public override readonly name = 'DelayedError';

    public constructor(
        public readonly type: DelayedErrorType,
        public readonly title: string,
        options?: ErrorOptions,
    ) {
        let message;
        switch (type) {
            case 'get':
                message = `Delayed '${title}' not yet set`;
                break;
            case 'set':
                message = `Delayed '${title}' already set`;
                break;
            default:
                unreachable(type);
        }
        super(message, options);
    }
}
