<script lang="ts">
  /**
   * Unique CSS `anchor-name` of the reference element this tooltip should be attached to.
   */
  export let anchorName: `--${string}` | undefined = undefined;

  let isOpen = false;

  /**
   * Open the tooltip.
   */
  export function open(): void {
    isOpen = true;
  }

  /**
   * Close the tooltip.
   */
  export function close(): void {
    isOpen = false;
  }
</script>

{#if anchorName !== undefined && isOpen}
  <div class="tooltip" style:position-anchor={anchorName}>
    <slot />
  </div>

  <div class="chevron" style:position-anchor={anchorName} />
{/if}

<style lang="scss">
  @use 'component' as *;

  .tooltip {
    position: absolute;
    position-area: top;
    bottom: calc(anchor(top) + rem(10px));
    margin: rem(4px) rem(4px) rem(0px);

    display: flex;
    align-items: center;
    justify-content: space-around;

    background: var(--ic-tooltip-background-color);
    border-radius: rem(8px);
    box-shadow: var(--ic-tooltip-box-shadow);
    color: var(--ic-tooltip-color);
  }

  .chevron {
    position: absolute;
    position-area: top;
    bottom: calc(anchor(top) + rem(3px));

    width: rem(16px);
    height: rem(8px);
    filter: var(--ic-tooltip-chevron-drop-shadow-filter);

    &::after {
      content: '';
      display: block;
      width: 100%;
      height: 100%;
      background: var(--ic-tooltip-background-color);
      clip-path: polygon(0 0, 50% 100%, 100% 0);
    }
  }
</style>
