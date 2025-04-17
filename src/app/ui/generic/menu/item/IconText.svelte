<script lang="ts">
  import type {Snippet} from 'svelte';

  interface Props {
    snippetIcon?: Snippet;
    snippetText?: Snippet;
    wip?: boolean;
  }

  const {snippetIcon, snippetText, wip = false}: Props = $props();
</script>

<div class="icon-text" class:wip>
  <div class="icon">
    {@render snippetIcon?.()}
  </div>
  <div class="text">
    {@render snippetText?.()}
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .icon-text {
    @include def-var(--c-icon-font-size, #{rem(24px)});

    display: grid;
    grid-template: 'icon text' #{rem(48px)} / #{rem(48px)} auto;
    column-gap: rem(8px);
    align-items: center;
    cursor: pointer;
    user-select: none;

    .icon {
      grid-area: icon;
      place-self: center;
      display: grid;
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }

    &:hover {
      .icon {
        background-color: var(--cc-menu-item-icon-text-background-color--hover);
      }
    }

    &:active {
      .icon {
        background-color: var(--cc-menu-item-icon-text-background-color--active);
      }
    }

    .text {
      grid-area: text;
    }
  }
</style>
