<!--
  @component Renders the given content as a child of `target`. Note: If `target` is not defined, the
  portal will not be rendered at all.
-->
<script lang="ts">
  import type {PortalProps} from '~/app/ui/components/hocs/portal/props';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {children, hidden = false, target = undefined}: PortalProps = $props();

  let invalid = $state(false);
  let ref = $state<SvelteNullableBinding<HTMLElement>>(null);

  function handleChangeTarget(currentTarget: typeof target, currentRef: typeof ref): void {
    if (currentTarget !== undefined && currentTarget !== null && currentRef !== null) {
      currentTarget.appendChild(currentRef);
      invalid = false;
    } else {
      invalid = true;
    }
  }

  $effect(() => {
    handleChangeTarget(target, ref);
  });
</script>

<div bind:this={ref} class="portal" class:hidden>
  {#if !invalid}
    {@render children?.()}
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .portal {
    &.hidden {
      display: none;
    }
  }
</style>
