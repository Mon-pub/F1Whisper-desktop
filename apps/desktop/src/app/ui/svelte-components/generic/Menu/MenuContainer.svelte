<script lang="ts">
  import type {Snippet} from 'svelte';

  interface Props {
    readonly children?: Snippet;
    /**
     * Predefined size to choose from.
     */
    readonly mode: 'small' | 'large';
  }

  const {children, mode}: Props = $props();
</script>

<div data-mode={mode}>
  {@render children?.()}
</div>

<style lang="scss">
  @use 'component' as *;

  div {
    display: flex;
    flex-direction: column;
    padding: em(8px) 0;
    min-width: var(--c-menu-container-min-width, auto);
    width: var(--c-menu-container-width, auto);
    max-width: var(--c-menu-container-max-width, auto);
    border-radius: rem(8px);
    background-color: var(--c-menu-container-background-color, default);

    // Cap the menu height to the viewport (minus a margin) and scroll internally when the content
    // is taller than fits — so a long list (e.g. the 29-language picker) stays fully reachable,
    // including its top items. Short menus are shorter than the cap and therefore unaffected. The
    // popover positioner re-measures after this cap applies (see `Popover.svelte`), so the capped
    // menu is still clamped within the viewport.
    max-height: calc(100vh - #{rem(32px)});
    overflow-y: auto;
    overscroll-behavior: contain;

    &[data-mode='small'] {
      @include def-var(
        (
            --c-menu-item-padding: var(--c-menu-container-small-item-padding, default),
            --c-menu-item-gap: var(--c-menu-container-small-item-gap, default),
            --c-icon-font-size: var(--c-menu-container-small-item-icon-size, default)
          )...
      );
    }

    &[data-mode='large'] {
      @include def-var(
        (
            --c-menu-item-padding: var(--c-menu-container-large-item-padding, default),
            --c-menu-item-gap: var(--c-menu-container-large-item-gap, default),
            --c-icon-font-size: var(--c-menu-container-large-item-icon-size, default)
          )...
      );
    }
  }
</style>
