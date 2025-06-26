<script lang="ts">
  import type {ProgressBarProps} from '~/app/ui/components/partials/poll/internal/choice/internal/progress-bar/props';

  const {disabled, value}: ProgressBarProps = $props();
</script>

<div class="container">
  <div
    class={`progress ${disabled ? 'disabled' : 'enabled'}`}
    style:--c-t-value={`${value}%`}
  ></div>
</div>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-t-value);

  .container {
    height: rem(6px);
    margin: rem(8px) 0px;
    background-color: var(--c-linear-progress-background-color, default);
    border-radius: 3px;
    overflow: hidden;

    .progress {
      height: 100%;
      transform: translateX(calc(-100% + #{var($-temp-vars, --c-t-value, 0%)}));
      transition: var(--c-linear-progress-transition, default);

      &.enabled {
        background-color: var(--c-linear-progress-color, default);
      }

      &.disabled {
        background-color: var(--mc-message-poll-track-color--disabled);
      }
    }
  }
</style>
