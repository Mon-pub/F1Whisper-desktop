<!--
  @component Renders a chat message bubble.
-->
<script lang="ts">
  import type {BubbleProps} from '~/app/ui/components/molecules/message/internal/bubble/props';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  let {
    children,
    clickable = false,
    direction,
    highlighted = $bindable(false),
    onclick,
    oncompletehighlightanimation,
    padding = 'md',
    alignment = 'start',
  }: BubbleProps = $props();

  let element: SvelteNullableBinding<Element> = $state(null);

  function handleChangeHighlight(currentHighlighted: boolean): void {
    if (currentHighlighted) {
      element?.addEventListener(
        'animationend',
        () => {
          highlighted = false;
          oncompletehighlightanimation?.();
        },
        {once: true},
      );
    }
  }

  $effect(() => {
    handleChangeHighlight(highlighted);
  });
</script>

<button
  bind:this={element}
  class={`bubble ${direction} ${padding} a-${alignment}`}
  class:highlighted
  data-disabled={!clickable}
  {onclick}
>
  {@render children?.()}
</button>

<style lang="scss">
  @use 'component' as *;

  .bubble {
    @extend %neutral-input;

    position: relative;
    border-radius: rem(10px);

    &.inbound {
      background-color: var(--mc-message-background-color-incoming);
    }

    &.outbound {
      background-color: var(--mc-message-background-color-outgoing);
    }

    &.none {
      background-color: var(--mc-status-message-background-color);
    }

    &.xs {
      padding: rem(2px);
    }

    &.sm {
      padding: rem(4px) rem(8px);
    }

    &.md {
      padding: rem(8px) rem(10px);
    }

    // Alignment
    &.a-start {
      text-align: start;
    }

    &.a-center {
      text-align: center;
    }

    &.a-end {
      text-align: end;
    }

    &::after {
      content: '';
      position: absolute;
      pointer-events: none;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
    }

    &.highlighted {
      &::after {
        animation-name: pulse-brightness;
        animation-duration: 0.5s;
        animation-timing-function: ease-in-out;
        animation-delay: 0s;
        animation-iteration-count: 2;
      }
    }

    &:not([data-disabled='true']) {
      &::after {
        border-radius: rem(10px);
        transition: background-color 0.15s;
      }

      &:hover {
        cursor: pointer;

        &::after {
          background-color: var(--mc-message-highlight-overlay-color);
        }
      }

      &:focus-visible {
        // Workaround to prevent the border from increasing the size. Unfortunately, `border-box` does
        // not work here.

        &::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          border-radius: inherit;
          border: solid em(1px) var(--c-icon-button-naked-outer-border-color--focus);
        }
      }
    }
  }

  @keyframes pulse-brightness {
    50% {
      background-color: var(--mc-message-highlight-overlay-color);
    }
  }
</style>
