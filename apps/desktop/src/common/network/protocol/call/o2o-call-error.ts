/**
 * Errors associated to a 1:1 call.
 *
 * Kept in its own module so callers can inspect the typed error without importing the call manager.
 */
export type O2oCallErrorType =
    | {readonly kind: 'disabled'}
    | {readonly kind: 'busy'}
    | {readonly kind: 'calls-not-configured'}
    /**
     * F1Whisper fork (FU-H09): a linked (follower) device attempted to place or accept a 1:1 call.
     * Outgoing signaling tasks report the expected denial as a result; the call manager maps that
     * result outside the protocol task loop so the call is torn down. For an outgoing call, this
     * typed error lets the UI surface a dedicated "not available on a linked device" message instead
     * of leaving a fake ringing state.
     */
    | {readonly kind: 'follower-mode'}
    | {readonly kind: 'unexpected-error'};

export class O2oCallError extends Error {
    public constructor(
        public readonly type: O2oCallErrorType['kind'],
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
    }
}
