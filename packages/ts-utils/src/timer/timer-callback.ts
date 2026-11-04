import type {TimerCanceller} from './timer-canceller.js';

/**
 * Callback for a timer.
 */
export type TimerCallback = (canceller: TimerCanceller) => void;
