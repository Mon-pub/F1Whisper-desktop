<script lang="ts">
  import type {Snippet} from 'svelte';

  interface Props {
    readonly children?: Snippet;
    /**
     * Let the icon appear disabled.
     */
    readonly disabled?: boolean;
    /**
     * Font to be used.
     */
    readonly font: string;
    /**
     * Optional title of the icon
     */
    readonly title?: string;
  }

  const {children, disabled = false, font, title = ''}: Props = $props();
</script>

<span class="icon" {title} class:disabled style:--c-t-font-family="'{font}'">
  {#if children}{@render children()}{:else}info{/if}
</span>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-t-font-family);

  .icon {
    font-size: var(--c-icon-font-size, unset);
    font-family: var($-temp-vars, --c-t-font-family);
    font-weight: normal;
    font-style: normal;
    display: inline-block;
    line-height: 1em;
    text-transform: none;
    letter-spacing: normal;
    word-wrap: normal;
    white-space: nowrap;
    direction: ltr;
    opacity: var(--c-icon-opacity, default);

    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    -moz-osx-font-smoothing: grayscale;

    &.disabled {
      opacity: var(--c-icon-opacity--disabled, default);
    }
  }
</style>
