<!--
  @component Renders a reactive list of keyed items which can be modified.

  The list also abstracts generic list functionality, like scrolling to an item, glueing, and
  observing items that enter and exit the view.
-->
<script lang="ts" generics="TProps extends {readonly id: unknown}">
  import {onDestroy, onMount, tick} from 'svelte';

  import {intersection} from '~/app/ui/actions/intersection';
  import type {LazyListProps} from '~/app/ui/components/hocs/lazy-list/props';
  import {isFullyVisibleVertical, waitForPresenceOfElement} from '~/app/ui/utils/element';
  import {scrollIntoViewIfNeededAsync} from '~/app/ui/utils/scroll';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {assertUnreachable, ensureError} from '~/common/utils/assert';
  import {createBufferedDispatcher} from '~/common/utils/callback';
  import {AsyncLock} from '~/common/utils/lock';
  import {TIMER} from '~/common/utils/timer';

  const {
    items,
    onerror,
    onitemanchored,
    onitementered = () => {},
    onitemexited = () => {},
    onscroll,
    snippetAfter,
    snippetBefore,
    snippetItem,
    visibleItemId,
  }: LazyListProps<TProps> = $props();

  const [dispatchBuffered, suspendCallbackBuffer, resumeCallbackBuffer] = createBufferedDispatcher({
    onitementered,
    onitemexited,
  });

  const anchorLock = new AsyncLock();

  // Note: For some reason, with 1.0, the visibility is not being detected reliably.
  const anchorIntersectionThreshold = 0.9;

  let containerElement = $state<SvelteNullableBinding<HTMLOListElement>>(null);
  let anchorElement = $state<SvelteNullableBinding<HTMLSpanElement>>(null);

  let isGlobalAnchorEnabled = $state(visibleItemId === undefined);
  let isItemAnchorEnabled = $state(visibleItemId !== undefined);
  let isAtBottom = $state(true);

  /**
   * Scrolls the view to the item with the given `id`. Note: If the item is not already present, the
   * view will not scroll.
   */
  export async function scrollToItem(
    id: TProps['id'],
    options?: ScrollIntoViewOptions,
  ): Promise<void> {
    // Enqueue execution to avoid race conditions if another anchoring process is already in
    // progress.
    return await anchorLock.with(async () => {
      const itemElement =
        containerElement?.querySelector(`.item[data-item-id="${id}"]`) ?? undefined;
      if (itemElement === undefined) {
        return;
      }

      // Suspend global anchor, or autoscroll might not work if the view is at the very bottom.
      isGlobalAnchorEnabled = false;
      await tick();

      // Because items entering or exiting the viewport are under observation, `itementered` and
      // `itemexited` events might be triggered during automated scrolling, which in turn might
      // result in additional items to be loaded or removed. As this might result in the browser
      // ending up scrolling to the wrong place in the list, event dispatching is disabled during
      // scroll, but the events will be buffered and sent when scrolling is finished.
      suspendCallbackBuffer();

      // Scroll item into view and wait until scrolling is done.
      await scrollIntoViewIfNeededAsync({
        container: containerElement,
        element: itemElement,
        options,
        timeoutMs: 3000,
      }).catch((error: unknown) => {
        onerror?.(ensureError(error));
      });

      // Resume callback dispatcher and re-emit all buffered calls to get the backend in sync.
      resumeCallbackBuffer({replay: 'all'});

      // Re-enable global anchor.
      isGlobalAnchorEnabled = true;
      await tick();

      const item = items.find((i) => i.get().id === id);
      if (item !== undefined) {
        onitemanchored?.(item.get());
      }
    });
  }

  async function handleChangeVisibleItem(): Promise<void> {
    // Enqueue execution to avoid race conditions if another anchoring process is already in
    // progress.
    return await anchorLock.with(async () => {
      // If no item is to be made visible, do nothing.
      if (visibleItemId === undefined) {
        return;
      }

      // Enable item anchor to make it "sticky" while we wait for the element to appear and suspend
      // global anchor, or autoscroll might not work if the view is at the very bottom.
      isGlobalAnchorEnabled = false;
      isItemAnchorEnabled = true;

      // Wait for Svelte to apply changes to the DOM.
      await tick();

      // Wait until the element of the anchored item is present in the DOM.
      await waitForPresenceOfElement({
        container: containerElement,
        selector: `.item[data-item-id="${visibleItemId}"]`,
        subtree: false,
        timeoutMs: 3000,
      })
        .then(
          async (element) =>
            // Scroll item into view if it isn't already and wait until scrolling is done.
            await scrollIntoViewIfNeededAsync({
              container: containerElement,
              element,
              options: {
                behavior: 'instant',
                block: 'start',
              },
              timeoutMs: 3000,
            }),
        )
        .catch((error: unknown) => {
          onerror?.(ensureError(error));
        });

      // Re-evaluate whether the view is scrolled all the way to the bottom.
      isAtBottom = isFullyVisibleVertical({
        container: containerElement,
        element: anchorElement,
      });

      // Disable item anchor and re-enable global anchor now that scrolling is finished.
      isItemAnchorEnabled = false;
      isGlobalAnchorEnabled = true;
      await tick();

      const item = items.find((i) => i.get().id === visibleItemId);
      if (item !== undefined) {
        onitemanchored?.(item.get());
      }
    });
  }

  const handleScrollDebounced = TIMER.debounce(
    () => {
      if (containerElement !== null) {
        const scrollDistanceFromBottom =
          containerElement.scrollHeight -
          containerElement.clientHeight -
          containerElement.scrollTop;

        onscroll?.({distanceFromBottomPx: scrollDistanceFromBottom});
      }
    },
    150,
    false,
  );

  const itemObserverOptions = $derived({
    root: containerElement,
    threshold: 0,
  });

  const anchorObserverOptions = $derived({
    root: containerElement,
    threshold: anchorIntersectionThreshold,
  });

  $effect(() => {
    reactive(handleChangeVisibleItem, [visibleItemId]).catch(assertUnreachable);
  });

  onMount(() => {
    containerElement?.addEventListener('scroll', handleScrollDebounced);
  });

  onDestroy(() => {
    containerElement?.removeEventListener('scroll', handleScrollDebounced);
  });
</script>

<ol bind:this={containerElement} class="list">
  <!-- Display an element at the start of the list. -->
  {@render snippetBefore?.()}

  {#each items as item (item.get().id)}
    {@const {id} = item.get()}
    {@const isAnchored = isItemAnchorEnabled && visibleItemId === id}

    <li
      data-item-id={`${id}`}
      class="item"
      class:anchored={isAnchored}
      use:intersection={{
        options: itemObserverOptions,
      }}
      onintersectionenter={(event) => {
        if (isAnchored) {
          anchorLock
            .with(async () => {
              isItemAnchorEnabled = false;
              return await Promise.resolve();
            })
            .catch(assertUnreachable);
        }
        dispatchBuffered('onitementered', item.get());
      }}
      onintersectionexit={() => {
        dispatchBuffered('onitemexited', item.get());
      }}
    >
      {@render snippetItem?.(item)}
    </li>
  {/each}

  <!-- Display an element at the very end of the list. -->
  {@render snippetAfter?.()}

  <span
    bind:this={anchorElement}
    use:intersection={{
      options: anchorObserverOptions,
    }}
    class="global-anchor bottom"
    class:anchored={isGlobalAnchorEnabled && isAtBottom}
    onintersectionenter={(event) => {
      isAtBottom = event.detail.entry.intersectionRatio >= anchorIntersectionThreshold;
    }}
    onintersectionexit={() => {
      isAtBottom = false;
    }}
  ></span>
</ol>

<style lang="scss">
  @use 'component' as *;

  .list {
    padding: 0;
    margin: 0;
    height: 100%;

    list-style-type: none;
    overflow: auto;
    overscroll-behavior-y: contain;
    scroll-snap-type: y mandatory;

    .item {
      // Anchor the list.
      &.anchored {
        scroll-snap-align: start;
      }
    }

    .global-anchor {
      &.bottom {
        position: relative;
        display: block;
        height: rem(10px);
        margin-top: rem(-10px);
        visibility: hidden;

        // Anchor the list only if no item is anchoring the list.
        &.anchored:not(:has(~ .item.anchored)) {
          scroll-snap-align: end;
        }
      }
    }
  }
</style>
