<script lang="ts">
  import {onDestroy, type Snippet} from 'svelte';

  import {globals} from '~/app/globals';

  const hotkeyManager = globals.unwrap().hotkeyManager;

  interface Props {
    readonly visible?: boolean;
    readonly suspendHotkeysWhenVisible?: boolean;
    readonly children?: Snippet;
  }

  const {visible = true, suspendHotkeysWhenVisible = true, children}: Props = $props();

  function handleVisibilityChange(value: boolean): void {
    if (!suspendHotkeysWhenVisible) {
      return;
    }

    if (value) {
      hotkeyManager.suspend();
    } else {
      hotkeyManager.resume();
    }
  }

  $effect(() => {
    handleVisibilityChange(visible);
  });

  onDestroy(() => {
    handleVisibilityChange(false);
  });
</script>

<div>
  {@render children?.()}
</div>

<style lang="scss">
  @use 'component' as *;

  div {
    display: contents;
    --c-global-overlay-background: var(--cc-modal-dialog-background-color);
  }
</style>
