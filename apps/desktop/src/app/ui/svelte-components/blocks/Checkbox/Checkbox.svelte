<script lang="ts">
  import type {HTMLAttributes, HTMLInputAttributes} from 'svelte/elements';

  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  interface Props
    extends Pick<HTMLAttributes<HTMLDivElement>, 'onclick' | 'onkeydown' | 'onkeyup'>,
      Omit<HTMLInputAttributes, 'onchange' | 'onclick' | 'onkeydown' | 'onkeyup' | 'ontoggle'> {
    /**
     * Whether the checkbox is checked.
     */
    readonly checked?: boolean;
    /**
     * Whether to disable the checkbox.
     */
    readonly disabled?: boolean;
    readonly oncheck?: (checked: boolean) => void;
  }

  let {
    checked = $bindable(),
    disabled = false,
    oncheck,
    onclick,
    onkeydown,
    onkeyup,
    ...rest
  }: Props = $props();

  let inputElement = $state<SvelteNullableBinding<HTMLInputElement>>(null);

  /**
   * Toggles the value of the checkbox, if not disabled.
   */
  export function check(): void {
    if (!disabled && inputElement !== null) {
      checked = checked === undefined ? true : !checked;

      oncheck?.(checked);
    }
  }

  function handleClick(
    event: MouseEvent & {readonly currentTarget: EventTarget & HTMLDivElement},
  ): void {
    event.preventDefault();
    event.stopPropagation();

    check();
    onclick?.(event);
  }

  function handleKeydown(
    event: KeyboardEvent & {readonly currentTarget: EventTarget & HTMLDivElement},
  ): void {
    if (['Space', 'Enter', 'NumpadEnter'].includes(event.code)) {
      event.preventDefault();
      event.stopPropagation();

      check();
    }

    onkeydown?.(event);
  }
</script>

<div
  aria-checked={checked}
  aria-disabled={disabled}
  onclick={handleClick}
  onkeydown={handleKeydown}
  {onkeyup}
  role="checkbox"
  tabindex="0"
>
  <span>
    <MdIcon theme="Filled">
      {#if checked}check_box{:else}check_box_outline_blank{/if}
    </MdIcon>
  </span>
  <input bind:this={inputElement} bind:checked type="checkbox" {...rest} />
</div>

<style lang="scss">
  @use 'component' as *;

  div {
    @extend %neutral-input;
    display: grid;
    place-items: center;
    user-select: none;
    padding: var(--c-checkbox-padding, default);
    border: 1px solid transparent;
    border-radius: 50%;

    span {
      display: grid;
      place-items: center;
      font-size: em(24px);
      color: var(--c-checkbox-color, default);
    }

    &:not([aria-disabled='true']) {
      cursor: pointer;

      &:hover {
        background-color: var(--c-checkbox-outer-background-color--hover, default);
      }

      &:focus-visible {
        background-color: var(--c-checkbox-outer-background-color--focus, default);
        border-color: var(--c-checkbox-outer-border-color--focus, default);
      }

      &:active {
        background-color: var(--c-checkbox-outer-background-color--active, default);
      }
    }

    &[aria-disabled='true'] {
      opacity: var(--c-checkbox-opacity--disabled, default);
    }
  }

  input {
    display: none;
  }
</style>
