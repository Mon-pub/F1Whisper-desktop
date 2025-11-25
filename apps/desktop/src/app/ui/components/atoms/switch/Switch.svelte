<!--
  @component Renders a switch that can be toggled on and off.
-->
<script lang="ts">
  import type {SwitchProps} from '~/app/ui/components/atoms/switch/props';

  let {
    checked = $bindable(false),
    disabled = $bindable(false),
    onclick,
    ...restProps
  }: SwitchProps = $props();
</script>

<!-- A11y is already covered by the contained checkbox. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="switch" class:checked class:disabled {onclick}>
  <div class="track"></div>
  <div class="thumb"></div>

  <input
    bind:checked
    aria-checked={checked}
    {disabled}
    role="switch"
    type="checkbox"
    {onclick}
    {...restProps}
  />
</div>

<style lang="scss">
  @use 'component' as *;

  .switch {
    position: relative;
    width: em(29px);
    height: em(18px);
    transition: color 0.15s ease;

    .thumb {
      left: 0;
      background-color: var(--cc-switch-thumb-color-off);
      position: relative;

      &::before {
        content: '';
        transform: scale(2.2222);
        left: 0;
        top: 0;
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        pointer-events: none;
      }

      &:hover {
        &::before {
          background-color: var(--cc-switch-thumb-glow-color);
        }
      }

      &:active {
        &::before {
          background-color: var(--cc-switch-thumb-glow-color--active);
        }
      }
    }

    &:focus-within {
      .thumb {
        &::before {
          border: solid em(0.22px) var(--cc-switch-thumb-glow-border-color);
        }
      }
    }

    .track {
      color: var(--cc-switch-track-color-off);
    }

    &.checked {
      .thumb {
        left: em(11px);
        background-color: var(--cc-switch-thumb-color);
      }

      .track {
        color: var(--cc-switch-track-color);
      }

      &.disabled {
        .thumb {
          background-color: var(--cc-switch-thumb-color--disabled);
        }

        .track {
          color: var(--cc-switch-track-color--disabled);
        }
      }
    }

    &.disabled {
      pointer-events: none;

      .thumb {
        background-color: var(--cc-switch-thumb-color-off--disabled);
      }

      .track {
        color: var(--cc-switch-track-color-off--disabled);
      }
    }
  }

  .thumb {
    position: absolute;
    left: 0;
    width: em(18px);
    height: em(18px);
    border-radius: 50%;
    background-color: var(--cc-switch-thumb-color-off);
    transition: left 0.15s ease;
    cursor: pointer;
  }

  .track {
    position: absolute;
    width: em(29px);
    height: em(12px);
    top: calc(50% - #{em(6px)});
    border-radius: em(14px);
    color: var(--cc-switch-track-color-off);
    background-color: currentColor;
  }

  input {
    @extend %neutral-input;

    display: block;
    width: 100%;
    height: 100%;
    opacity: 0;
    user-select: none;
    cursor: pointer;
  }
</style>
