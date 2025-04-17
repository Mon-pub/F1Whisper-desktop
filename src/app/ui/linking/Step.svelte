<script lang="ts">
  import type {Snippet} from 'svelte';

  interface Props {
    readonly scrollable?: boolean;
    readonly children?: Snippet;
  }

  const {scrollable = true, children}: Props = $props();
</script>

<div class="wrapper">
  <section class={scrollable ? 'panel scrollable' : 'panel'}>
    {@render children?.()}
  </section>
</div>

<style lang="scss">
  @use 'component' as *;

  $padding: rem(20px);

  .wrapper {
    height: 100vh;
    display: grid;
    grid-template: 'app' min-content;
    place-content: center;
    color: var(--t-text-e1-color);
    background-color: var(--t-pairing-background-color);

    .panel {
      @extend %elevation-160;
      border-radius: rem(8px);
      background-color: var(--c-modal-dialog-background-color, default);
      display: grid;
      width: rem(480px) + 2 * $padding;
      max-width: calc(100vw - calc(2 * rem(20px)));
      max-height: calc(100vh - calc(2 * rem(20px)));
      padding: $padding;
    }

    .scrollable {
      overflow-y: auto;
    }
  }
</style>
