<!--
  @component An element that sticks to another element (the _reference_), while ensuring that it
  doesn't overflow a _container_ (or the window). It handles:

  - Opening and closing.
  - Positioning.
  - Animations.
  - Updating the {@link popoverStore} to ensure that only a single popover is visible.
-->
<script lang="ts">
  import {onDestroy} from 'svelte';

  import {clickoutside} from '~/app/ui/actions/clickoutside';
  import {getPopoverOffset, popoverStore} from '~/app/ui/generic/popover/helpers';
  import type {PopoverProps} from '~/app/ui/generic/popover/props';
  import type {Offset, VirtualRect} from '~/app/ui/generic/popover/types';
  import {fade} from '~/app/ui/transitions/fade';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {unreachable} from '~/common/utils/assert';

  let {
    anchorPoints = {
      reference: {horizontal: 'left', vertical: 'bottom'},
      popover: {horizontal: 'left', vertical: 'top'},
    },
    closeOnClickOutside = true,
    container: constraintContainer,
    element = $bindable(),
    flip = true,
    offset = {left: 0, top: 0},
    onafterclose,
    onafteropen,
    onbeforeclose,
    onbeforeopen,
    onclickoutside,
    onclicktrigger,
    reference,
    safetyGap = {left: 0, right: 0, top: 0, bottom: 0},
    snippetPopover,
    snippetTrigger,
    triggerBehavior = 'toggle',
  }: PopoverProps = $props();

  let trigger = $state<SvelteNullableBinding<HTMLElement>>(null);
  let popover = $state<SvelteNullableBinding<HTMLElement>>(null);

  let isOpen = $state(false);

  let position: Offset | undefined = $derived(calculatePosition());

  // Re-measure and reposition the popover once it (and its content) is actually laid out, then keep
  // it correct as the content/viewport changes size. The initial `$derived` above can run before
  // the menu content has laid out (width still 0), in which case no off-screen correction is applied
  // and the popover would clip at the viewport edge — most visibly in RTL, where menus anchor near
  // the right edge. This post-layout reposition fixes that for every popover/menu/dropdown.
  let resizeObserver: ResizeObserver | undefined = undefined;

  $effect(() => {
    const currentPopover = popover;
    if (currentPopover === null) {
      return undefined;
    }

    // Reposition on the next frame, after the browser has laid out the popover content.
    const frame = requestAnimationFrame(() => forceReposition());

    // Keep the popover positioned correctly if its size changes (e.g. async content) or the window
    // is resized while it is open.
    resizeObserver = new ResizeObserver(() => forceReposition());
    resizeObserver.observe(currentPopover);
    window.addEventListener('resize', forceReposition);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      resizeObserver = undefined;
      window.removeEventListener('resize', forceReposition);
    };
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    window.removeEventListener('resize', forceReposition);
  });

  /**
   * Close the `popover`.
   */
  export function close(event?: MouseEvent): void {
    if (!isOpen) {
      return;
    }

    onbeforeclose?.(event);

    isOpen = false;

    // Remove any existing close function.
    popoverStore.set(undefined);
  }

  /**
   * Open the `popover`.
   */
  export function open(event?: MouseEvent): void {
    if (isOpen) {
      return;
    }

    onbeforeopen?.(event);

    if ($popoverStore !== undefined) {
      // Call the defined close function.
      $popoverStore(event);
      // Remove the close function.
      popoverStore.set(undefined);
    }
    // Define a new close function.
    popoverStore.set(close);

    isOpen = true;
  }

  /**
   * Open or close the `popover`, depending on its previous state.
   */
  export function toggle(event?: MouseEvent): void {
    if (isOpen) {
      close(event);
    } else {
      open(event);
    }
  }

  /**
   * Force recalculation of the popup's positioning, and update.
   */
  export function forceReposition(): void {
    if (isOpen) {
      position = calculatePosition();
    }
  }

  function calculatePosition(): typeof position {
    const currentReference = reference ?? trigger ?? undefined;

    // Turn off the eslint rule so that we don't have to check all of them for `null` and
    // `undefined`.
    //
    //  eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!element || !currentReference || !popover) {
      return undefined;
    }

    // The popover is `position: fixed`, so it is positioned in VIEWPORT coordinates. Use the visual
    // viewport as both the positioning origin and (by default) the constraint box — never the
    // scroll-shifted `document.body`, whose `getBoundingClientRect()` is offset by page scroll and
    // would push the menu off-screen. An explicitly-passed `constraintContainer` is still honored.
    const viewportRect: VirtualRect = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const popoverOffset = getPopoverOffset(
      constraintContainer ?? viewportRect,
      viewportRect,
      currentReference,
      popover,
      anchorPoints,
      offset,
      flip,
      safetyGap,
    );

    return popoverOffset;
  }

  function handleClickTrigger(event: MouseEvent): void {
    onclicktrigger?.(event);

    switch (triggerBehavior) {
      case 'none':
        break;

      case 'open':
        open(event);
        break;

      case 'toggle':
        toggle(event);
        break;

      default:
        unreachable(triggerBehavior);
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    if (popover === null) {
      return;
    }

    if (!isOpen) {
      return;
    }

    // Ignore clicks inside trigger.
    if (
      // If `triggerBehavior` is not `"none"`, clicks on it should not count as clicks outside, or
      // it would be closed immediately.
      triggerBehavior !== 'none' &&
      (event.target === trigger || trigger?.contains(event.target as Node) === true)
    ) {
      return;
    }

    // Ignore clicks inside wrapper.
    if (event.target === popover || popover.contains(event.target as Node)) {
      return;
    }

    onclickoutside?.(event);

    if (!closeOnClickOutside) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    close();
  }
</script>

<div class="container" bind:this={element}>
  {#if snippetTrigger !== undefined}
    <!-- Disable a11y warnings here, because `"trigger"` actually isn't intended as a clickable
    element itself, but only as an unstyled wrapper element that catches and handles `"click"`
    events (because `<slot>` doesn't support them directly). The contents of the slot should instead
    handle a11y themselves and emit the necessary click events. Note: Use `<button>`s as slot
    content, so we get click events "for free" (even on keypress). -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="trigger" bind:this={trigger} onclick={handleClickTrigger}>
      {@render snippetTrigger()}
    </div>
  {/if}

  {#if isOpen}
    <!-- The popover is positioned with `position: fixed` (viewport coordinates) so it escapes any
    `overflow: hidden/auto` ancestor (e.g. the scrollable settings panel) that would otherwise clip
    it, and so its viewport-clamped position is honored regardless of page/panel scroll. -->
    <div
      bind:this={popover}
      use:clickoutside={{enabled: isOpen}}
      transition:fade={{duration: 100}}
      class="popover"
      style:transform={position === undefined
        ? undefined
        : `translate(${position.left}px, ${position.top}px)`}
      onclickoutside={({detail: {event}}) => {
        handleClickOutside(event);
      }}
      onintroend={() => {
        onafteropen?.();
      }}
      onoutroend={() => {
        onafterclose?.();
      }}
    >
      {@render snippetPopover()}
    </div>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    position: relative;

    // The popover is positioned in VIEWPORT coordinates via `position: fixed` + a `translate`
    // transform. `fixed` makes it escape any `overflow: hidden/auto` ancestor (e.g. the scrollable
    // settings panel) that would otherwise clip it, and decouples it from page/panel scroll — so the
    // viewport-clamped position is always honored. (No ancestor on the menu paths sets a `transform`
    // / `filter`, which would otherwise trap a fixed element.)
    .popover {
      position: fixed;
      z-index: $z-index-modal;
      left: 0;
      top: 0;
    }
  }
</style>
