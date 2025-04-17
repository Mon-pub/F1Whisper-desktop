<script lang="ts">
  import type {LinearProgressVariant} from '~/app/ui/svelte-components/blocks/LinearProgress';

  interface Props {
    /**
     * The variant of the progress indicator to show.
     */
    readonly variant?: LinearProgressVariant;
    /**
     * Progress percentage value to be used. This will be ignored if variant
     * is 'indeterminate'.
     */
    readonly value?: number;
  }

  const {variant = 'indeterminate', value = 0}: Props = $props();
</script>

<div class="progress {variant}" style:--c-t-value={`${value}%`}>
  {#if variant === 'determinate'}
    <div></div>
  {:else}
    <div class="bar-1"></div>
    <div class="bar-2"></div>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-t-value);

  div {
    width: 100%;
    height: 100%;
    background-color: var(--c-linear-progress-background-color, default);
    position: relative;
    overflow: hidden;

    > * {
      width: 100%;
      position: absolute;
      background-color: var(--c-linear-progress-color, default);
    }

    &.determinate {
      > * {
        transform: translateX(calc(-100% + #{var($-temp-vars, --c-t-value, 0%)}));
        transition: var(--c-linear-progress-transition, default);
      }
    }

    &.indeterminate {
      .bar-1 {
        width: auto;
        animation: indeterminate-bar-1 2.1s cubic-bezier(0.65, 0.815, 0.735, 0.395) infinite;
      }

      .bar-2 {
        width: auto;
        animation: indeterminate-bar-2 2.1s cubic-bezier(0.165, 0.84, 0.44, 1) 1.15s infinite;
      }

      @keyframes indeterminate-bar-1 {
        0% {
          left: -35%;
          right: 100%;
        }
        60% {
          left: 100%;
          right: -90%;
        }
        100% {
          left: 100%;
          right: -90%;
        }
      }
      @keyframes indeterminate-bar-2 {
        0% {
          left: -200%;
          right: 100%;
        }
        60% {
          left: 107%;
          right: -8%;
        }
        100% {
          left: 107%;
          right: -8%;
        }
      }
    }
  }
</style>
