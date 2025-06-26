<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {CheckboxProps} from '~/app/ui/components/partials/poll/internal/choice/internal/checkbox/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  let {
    checked = $bindable(),
    disabled,
    id,
    oncheck,
    onclick,
    onkeydown,
    onkeyup,
    text,
  }: CheckboxProps = $props();

  function handleClick(event: MouseEvent): void {
    event.preventDefault();
    toggle();
    onclick?.(event);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (['Space', 'Enter', 'NumpadEnter'].includes(event.code)) {
      toggle();
    }

    onkeydown?.(event);
  }

  function toggle(): void {
    if (!disabled) {
      checked = !checked;
      oncheck?.(checked);
    }
  }
</script>

<div
  aria-checked={checked}
  class="container"
  onclick={handleClick}
  onkeydown={handleKeydown}
  {onkeyup}
  role="checkbox"
  tabindex="0"
>
  <span class={`icon ${disabled ? 'disabled' : 'enabled'}`}>
    {#if checked}
      <MdIcon theme="Filled">check_circle</MdIcon>
    {:else}
      <MdIcon theme="Outlined">circle</MdIcon>
    {/if}
  </span>
  <input type="checkbox" {id} bind:checked />
  <label for={id}><Text {text} /></label>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    align-items: center;
  }

  .icon {
    margin-right: rem(8px);
    font-size: rem(24px);

    &:hover:not(.disabled) {
      cursor: pointer;
    }

    &.enabled {
      color: var(--c-checkbox-color, default);
    }

    &.disabled {
      color: var(--mc-message-poll-choice-color--disabled);
    }
  }

  input {
    display: none;
  }
</style>
