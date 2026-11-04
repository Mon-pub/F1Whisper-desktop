<!--
  @component Renders an item of a `KeyValueList` with a switch.
-->
<script lang="ts">
  import {Switch} from '@threema/ui';

  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {ItemWithSwitchProps} from '~/app/ui/components/molecules/key-value-list/internal/item-with-switch/props';
  import Tooltip from '~/app/ui/generic/popover/Tooltip.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  let {
    checked = $bindable(false),
    children,
    disabled = $bindable(false),
    hint,
    key,
    onclickinfoicon,
    onswitch,
    options = {},
  }: ItemWithSwitchProps = $props();

  let tooltipComponent = $state<SvelteNullableBinding<Tooltip>>(null);

  const anchorName = `--${crypto.randomUUID()}` as const;

  function handleClickItem(event: MouseEvent): void {
    event.preventDefault();

    if (disabled) {
      return;
    }

    checked = !checked;
    onswitch?.({old: !checked, new: checked});
  }

  function handleMouseEnterHint(): void {
    tooltipComponent?.open();
  }

  function handleMouseLeaveHint(): void {
    tooltipComponent?.close();
  }
</script>

<button
  class="item"
  {disabled}
  onclick={handleClickItem}
  onmouseenter={hint === undefined ? undefined : handleMouseEnterHint}
  onmouseleave={hint === undefined ? undefined : handleMouseLeaveHint}
>
  <div class="left">
    <div class="header">
      <div class="key">{key}</div>

      {#if options.showInfoIcon}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="info" onclick={onclickinfoicon}>
          <MdIcon theme="Outlined">info</MdIcon>
        </div>
      {/if}
    </div>

    <div class="value">
      {@render children?.()}
    </div>
  </div>

  <div class="right">
    <span class="switch" style:anchor-name={hint === undefined ? undefined : anchorName}>
      <Switch bind:checked {disabled} />
    </span>
  </div>
</button>

{#if hint !== undefined}
  <Tooltip bind:this={tooltipComponent} {anchorName}>
    <span class="content">
      <Text alignment="center" text={hint} />
    </span>
  </Tooltip>
{/if}

<style lang="scss">
  @use 'component' as *;

  .item {
    @extend %neutral-input;

    text-align: start;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: rem(16px);
    padding: rem(10px) rem(16px);
    width: 100%;

    &:not(:disabled) {
      cursor: pointer;

      &:hover {
        background-color: var(--cc-conversation-preview-background-color--hover);
      }

      &:active {
        background-color: var(--cc-conversation-preview-background-color--active);
      }
    }

    .left {
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: rem(4px);

        .key {
          @extend %font-small-400;

          color: var(--t-text-e2-color);
        }

        .info {
          @extend %neutral-input;

          display: flex;
          align-items: center;
          justify-content: center;
          user-select: none;
          color: var(--ic-list-element-color);
          cursor: pointer;
        }
      }

      .value {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    }

    .right {
      .switch {
        display: flex;
        align-items: center;
        justify-content: center;
        width: rem(40px);
        height: rem(40px);
      }
    }
  }

  .content {
    padding: 0;
    margin: rem(10px);
    max-width: rem(280px);
    text-align: center;
  }
</style>
