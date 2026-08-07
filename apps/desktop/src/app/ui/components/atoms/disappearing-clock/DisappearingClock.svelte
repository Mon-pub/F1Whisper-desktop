<!--
  @component F1Whisper fork: an animated disappearing-message countdown clock. Renders a small clock
  face whose inner disc empties clockwise as the message's timer runs down, matching the Android
  fork's `DisappearingTimerBadgeView` (a port of Signal's `ExpirationTimerView`). Pure render: the
  tick is owned by the parent and passed in via `now`, so this atom holds no timer of its own. The
  face inherits `currentColor` and sizes to `--c-icon-font-size` so it matches sibling footer icons.
-->
<script lang="ts">
  import {
    DISAPPEARING_CLOCK_VIEWBOX,
    disappearingClockWedgePath,
    remainingClockFraction,
  } from '~/app/ui/components/atoms/disappearing-clock/disappearing-clock';
  import type {DisappearingClockProps} from '~/app/ui/components/atoms/disappearing-clock/props';

  const {timerSeconds, expiresAt, now}: DisappearingClockProps = $props();

  // Full disc until the timer starts (`expiresAt` unknown); otherwise the remaining fraction.
  const remainingFraction = $derived(
    expiresAt === undefined
      ? 1
      : remainingClockFraction(now.getTime(), expiresAt.getTime(), timerSeconds * 1000),
  );
  const wedgePath = $derived(disappearingClockWedgePath(remainingFraction));
</script>

<svg
  class="disappearing-clock-face"
  viewBox="0 0 {DISAPPEARING_CLOCK_VIEWBOX} {DISAPPEARING_CLOCK_VIEWBOX}"
  aria-hidden="true"
>
  <!-- Outer face outline. -->
  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" />
  <!-- Top knob. -->
  <path d="M10 1.5 H14 V3.2 H10 Z" fill="currentColor" />
  <!-- Remaining-time pie wedge, depleting clockwise. -->
  {#if wedgePath !== ''}
    <path d={wedgePath} fill="currentColor" />
  {/if}
</svg>

<style lang="scss">
  .disappearing-clock-face {
    // Mirror the size MdIcon derives from `--c-icon-font-size` so the clock matches its siblings.
    width: 1em;
    height: 1em;
    font-size: var(--c-icon-font-size);
    flex-shrink: 0;
  }
</style>
