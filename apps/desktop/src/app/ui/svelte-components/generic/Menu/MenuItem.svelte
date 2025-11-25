<script lang="ts">
  import type {Snippet} from 'svelte';
  import type {HTMLButtonAttributes} from 'svelte/elements';

  interface Props
    extends Pick<
      HTMLButtonAttributes,
      'onclick' | 'onkeydown' | 'onkeyup' | 'onmouseenter' | 'onmouseleave'
    > {
    readonly children?: Snippet;
    /**
     * Whether the item is disabled. Note: "pseudo" will look similar to a disabled item, but will
     * still be clickable.
     */
    readonly disabled?: boolean | 'pseudo';
    /**
     * Whether the item is selected or not.
     */
    readonly selected?: boolean;
    readonly snippetIcon?: Snippet;
  }

  const {
    children,
    disabled = false,
    onclick,
    onkeydown,
    onkeyup,
    onmouseenter,
    onmouseleave,
    selected = false,
    snippetIcon,
  }: Props = $props();
</script>

<button
  class:disabled={disabled === 'pseudo'}
  class:is-selected={selected}
  disabled={disabled === true}
  {onclick}
  {onkeydown}
  {onkeyup}
  {onmouseenter}
  {onmouseleave}
  tabindex={disabled === true ? -1 : 0}
  type="button"
>
  {#if snippetIcon !== undefined}
    <div class="icon">
      {@render snippetIcon()}
    </div>
  {/if}
  <div class="text">
    {@render children?.()}
  </div>
</button>

<style lang="scss">
  @use 'component' as *;

  button {
    flex: 1 0 auto;

    display: flex;
    flex-direction: row;
    align-items: center;

    padding: var(--c-menu-item-padding, default);
    gap: var(--c-menu-item-gap, default);
    user-select: none;
    border: em(1px) solid transparent;
    background-color: transparent;
    color: var(--c-menu-item-text-color, default);
    outline: unset;
    font-size: inherit;
    white-space: nowrap;

    .icon {
      display: grid;
      grid-area: icon;
      color: var(--c-menu-item-icon-color);
    }

    .text {
      grid-area: text;
      text-align: left;
      width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: rem(14px);
    }

    &:not(:disabled) {
      cursor: pointer;

      &:hover {
        background-color: var(--c-menu-item-background-color--hover, default);
      }

      &:focus-visible {
        background-color: var(--c-menu-item-background-color--focus, default);
        border: #{em(1px)} solid var(--c-menu-item-border-color--focus, default);
      }

      &.is-selected,
      &:active {
        background-color: var(--c-menu-item-background-color--active, default);
      }
    }

    &:disabled,
    &.disabled {
      opacity: var(--c-menu-item-opacity--disabled, default);
    }
  }
</style>
