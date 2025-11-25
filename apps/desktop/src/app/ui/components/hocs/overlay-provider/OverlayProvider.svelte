<!--
  @component Renders `snippetBelow` wrapped in an overlay, which dims the available area and
  contains `snippetAbove` in its center.
-->
<script lang="ts">
  import type {OverlayProviderProps} from '~/app/ui/components/hocs/overlay-provider/props';

  const {show = false, snippetAbove, snippetBelow}: OverlayProviderProps = $props();
</script>

<div class="container">
  {#if show}
    <span class="overlay">
      {@render snippetAbove?.()}
    </span>
  {/if}

  {@render snippetBelow?.()}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    position: relative;

    .overlay {
      position: absolute;
      display: flex;
      z-index: $z-index-plus;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      background-color: var(--mc-message-overlay-background-color);
      border-radius: rem(10px);
    }
  }
</style>
