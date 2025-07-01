<script lang="ts">
  import type {Snippet} from 'svelte';

  interface Props {
    /**
     * Unique CSS `anchor-name` of the reference element this tooltip should be attached to.
     */
    anchorName?: `--${string}` | undefined;
    children?: Snippet;
    /**
     * Position of the tooltip relative to the anchor element. Defaults to `"top"`.
     */
    position?: 'top' | 'bottom';
  }

  const {anchorName, children, position = 'top'}: Props = $props();

  let isOpen = $state<boolean>(false);

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
  <div class="tooltip" data-position={position} style:position-anchor={anchorName}>
    {@render children?.()}
  </div>

  <div class="chevron" data-position={position} style:position-anchor={anchorName}></div>
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

    &[data-position='bottom'] {
      position-area: bottom;
      top: calc(anchor(bottom) + rem(10px));
      bottom: unset;
      margin: rem(0px) rem(4px) rem(4px) rem(4px);
    }
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

    &[data-position='bottom'] {
      position-area: bottom;
      top: calc(anchor(bottom) + rem(3px));
      bottom: unset;

      &::after {
        clip-path: polygon(0 100%, 50% 0, 100% 100%);
      }
    }
  }
</style>
