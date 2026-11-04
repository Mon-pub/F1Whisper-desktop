import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * Props accepted by the `DisappearingClock` component (F1Whisper fork).
 */
export interface DisappearingClockProps {
    /** Total disappearing-message timer duration, in seconds. */
    readonly timerSeconds: u53;
    /**
     * When the message expires. Undefined while the timer has not started yet (e.g. an outgoing
     * message not yet delivered), in which case the clock shows a full disc.
     */
    readonly expiresAt?: Date;
    /**
     * The current time, ticked by the parent (typically once per second). Passed in rather than
     * owned here so a windowed message list drives a single shared tick.
     */
    readonly now: Date;
}
