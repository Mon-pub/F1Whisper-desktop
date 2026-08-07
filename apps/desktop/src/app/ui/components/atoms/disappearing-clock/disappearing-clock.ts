import type {f64} from '~/common/types';

/**
 * Geometry for the F1Whisper animated disappearing-message countdown clock (atom
 * `DisappearingClock.svelte`). Pure, DOM-free functions so the depletion math is unit-testable in
 * node, mirroring the Android fork's `DisappearingTimerBadgeView` (itself a port of Signal's
 * `ExpirationTimerView`): a clock face whose inner disc empties clockwise as the timer runs down.
 *
 * The face is drawn in a 24x24 user-space viewBox centred at (12, 12), matching the Android vector
 * frames (`ic_timer_00`..`ic_timer_60`). Where Android snaps to 13 discrete frames, we draw one
 * smooth pie wedge instead.
 */

/** Side length of the square SVG viewBox the clock is drawn in. */
export const DISAPPEARING_CLOCK_VIEWBOX = 24;

/** Centre of the clock face, in viewBox units. */
const CENTER = 12;

/** Radius of the inner (depleting) pie disc, in viewBox units. */
const PIE_RADIUS = 7;

/**
 * At/above this remaining fraction the wedge is drawn as a full disc. A 360-degree arc cannot be
 * expressed as a single SVG arc segment (start point equals end point), so the "essentially full"
 * case is special-cased to the closed-circle trick used by the Android full-disc frame.
 */
const FULL_DISC_EPSILON = 0.999;

/** Round to three decimals so emitted path coordinates stay free of binary-float noise. */
function round(value: f64): f64 {
    return Math.round(value * 1000) / 1000;
}

/**
 * Fraction of the timer still remaining, clamped to `[0, 1]`.
 *
 * Mirrors Signal's `delta / length` and the Android fork's `1 - progress`: `1` = just started
 * (full disc), `0` = elapsed (empty).
 *
 * @param nowMs Current time, epoch millis.
 * @param expiresAtMs Time the message expires, epoch millis.
 * @param timerMs Total timer duration, millis.
 */
export function remainingClockFraction(nowMs: f64, expiresAtMs: f64, timerMs: f64): f64 {
    if (timerMs <= 0) {
        // No positive window -> nothing meaningful to deplete.
        return 0;
    }
    const remaining = expiresAtMs - nowMs;
    if (remaining <= 0) {
        return 0;
    }
    if (remaining >= timerMs) {
        return 1;
    }
    return remaining / timerMs;
}

/**
 * SVG `path` `d` string for the remaining-time pie wedge, a sector anchored at 12 o'clock that
 * sweeps clockwise to cover `remainingFraction` of the disc. Returns the empty string when nothing
 * remains (the caller then draws only the outline).
 *
 * @param remainingFraction Remaining fraction in `[0, 1]` (typically from
 *   {@link remainingClockFraction}).
 */
export function disappearingClockWedgePath(remainingFraction: f64): string {
    if (remainingFraction <= 0) {
        return '';
    }
    const top = CENTER - PIE_RADIUS;
    if (remainingFraction >= FULL_DISC_EPSILON) {
        // Full disc: draw a closed circle anchored at the top point (single-arc 360-degree is
        // undrawable), matching the Android `ic_timer_00` full-disc frame.
        return `M ${CENTER} ${top} A ${PIE_RADIUS} ${PIE_RADIUS} 0 1 1 ${round(CENTER - 0.001)} ${top} Z`;
    }
    // Clockwise sweep from 12 o'clock. Screen y grows downward, so a point at clockwise angle
    // `theta` from the top is (cx + r*sin(theta), cy - r*cos(theta)); the SVG sweep-flag is 1.
    const sweep = remainingFraction * 2 * Math.PI;
    const endX = round(CENTER + PIE_RADIUS * Math.sin(sweep));
    const endY = round(CENTER - PIE_RADIUS * Math.cos(sweep));
    const largeArc = sweep > Math.PI ? 1 : 0;
    return `M ${CENTER} ${CENTER} L ${CENTER} ${top} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}
