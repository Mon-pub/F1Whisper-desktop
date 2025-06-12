<script lang="ts">
  import type {CircularProgressVariant} from '~/app/ui/svelte-components/blocks/CircularProgress';

  interface Props {
    /**
     * The variant of the progress indicator to show.
     */
    readonly variant?: CircularProgressVariant;
    /**
     * The color of the progress indicator. "default" is usually the primary color, "current" will
     * use `currentColor`. Defaults to "default".
     */
    readonly color?: 'default' | 'current';
    /**
     * Progress percentage value to be used. This will be ignored if variant
     * is 'indeterminate'.
     */
    readonly value?: number;
  }

  const {variant = 'indeterminate', color = 'default', value = 0}: Props = $props();
</script>

<div class={variant} style:--c-t-value={value}>
  <svg viewBox="20 20 40 40">
    <circle class={color} cx="40" cy="40" style:r="calc((40px - var(--c-t-thickness)) / 2)" />
  </svg>
</div>

<style lang="scss">
  @use 'sass:math';
  @use 'component' as *;

  $-temp-vars: (--c-t-value, --c-t-thickness, --c-t-circumference);

  div {
    display: grid;
    width: 100%;
    height: 100%;

    svg {
      width: 100%;
      height: 100%;
    }

    svg circle {
      @include def-var(
        $-temp-vars,
        --c-t-thickness,
        calc(#{var(--c-circular-progress-thickness, default)} / 2)
      );

      fill: var(--c-circular-progress-fill-color, default);
      stroke: var(--c-circular-progress-stroke-color, default);
      stroke-width: var($-temp-vars, --c-t-thickness);

      &.current {
        stroke: currentColor;
      }
    }

    &.determinate {
      transform: rotate(-90deg);

      svg circle {
        @include def-var(
          $-temp-vars,
          --c-t-circumference,
          calc(2 * #{math.$pi} * ((40px - var($-temp-vars, --c-t-thickness)) / 2))
        );

        stroke-dasharray: var($-temp-vars, --c-t-circumference);
        stroke-dashoffset: calc(
          ((100 - #{var($-temp-vars, --c-t-value, 0)}) / 100) * #{var(
              $-temp-vars,
              --c-t-circumference
            )}
        );
        transition: stroke-dashoffset 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms;
      }
    }

    &.indeterminate {
      animation: circular-rotate 1.4s linear infinite;

      svg circle {
        animation: circular-dash 1.4s ease-in-out infinite;
        stroke-dasharray: 80px, 200px;
      }
    }

    @keyframes circular-rotate {
      100% {
        transform: rotate(360deg);
      }
    }
    @keyframes circular-dash {
      0% {
        stroke-dasharray: 1, 200;
        stroke-dashoffset: 0;
      }
      50% {
        stroke-dasharray: 100, 200;
        stroke-dashoffset: -15;
      }
      100% {
        stroke-dasharray: 100, 200;
        stroke-dashoffset: -125;
      }
    }
  }
</style>
