<script lang="ts">
  import type {Snippet} from 'svelte';

  interface Props {
    children?: Snippet;
    onclickoverlay?: () => void;
  }

  const {children, onclickoverlay}: Props = $props();

  /**
   * Handle overlay pointerdown events.
   */
  function dispatchOverlayClick(event: PointerEvent): void {
    // Check pointer event was triggered directly on the overlay container.
    if (event.target === event.currentTarget) {
      onclickoverlay?.();
    }
  }
</script>

<div class="overlay-container" onpointerdown={dispatchOverlayClick}>
  {@render children?.()}
</div>

<style lang="scss">
  @use 'component' as *;

  .overlay-container {
    position: relative; // Required for z-index
    z-index: var(--c-global-overlay-z-index, auto);

    // Create background overlay
    &::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      background: var(--c-global-overlay-background, transparent);
      width: 100%;
      height: 100%;
      user-select: none;
    }

    & > :global(*) {
      // Make sure the slot element creates a new stacking context, so that it is in front of overlay
      isolation: isolate;
    }
  }
</style>
