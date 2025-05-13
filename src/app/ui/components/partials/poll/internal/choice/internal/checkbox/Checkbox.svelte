<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {CheckboxProps} from '~/app/ui/components/partials/poll/internal/choice/internal/checkbox/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  type $$Props = CheckboxProps;

  export let id: NonNullable<$$Props['id']>;
  export let text: NonNullable<$$Props['text']>;
  export let checked: NonNullable<$$Props['checked']>;
  export let disabled: NonNullable<$$Props['disabled']>;
  export let oncheck: $$Props['oncheck'];

  function toggle(): void {
    if (!disabled) {
      checked = !checked;
      oncheck(checked);
    }
  }
</script>

<div
  class="container"
  on:click
  on:click|preventDefault={toggle}
  on:keyup
  on:keydown
  on:keydown={(event) => {
    if (['Space', 'Enter', 'NumpadEnter'].includes(event.code)) {
      toggle();
    }
  }}
  role="checkbox"
  aria-checked={checked}
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

    &:hover {
      cursor: pointer;
    }

    &.enabled {
      color: var(--c-checkbox-color, default);
    }

    &.disabled {
      color: $grey-600;
    }
  }

  input {
    display: none;
  }
</style>
