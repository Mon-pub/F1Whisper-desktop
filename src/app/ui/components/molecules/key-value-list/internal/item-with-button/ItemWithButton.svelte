<!--
  @component Renders an item of a `KeyValueList` that contains a button.
-->
<script lang="ts">
  import type {ItemWithButtonProps} from '~/app/ui/components/molecules/key-value-list/internal/item-with-button/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {
    children,
    icon,
    key,
    onclick,
    onclickinfoicon,
    options = {},
  }: ItemWithButtonProps = $props();
</script>

<button class="item" {onclick}>
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
    <span class="icon">
      <MdIcon theme="Outlined">{icon}</MdIcon>
    </span>
  </div>
</button>

<style lang="scss">
  @use 'component' as *;

  .item {
    @extend %neutral-input;
    cursor: pointer;
    text-align: start;

    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: rem(16px);
    padding: rem(10px) rem(16px);
    width: 100%;

    &:hover {
      background-color: var(--cc-conversation-preview-background-color--hover);
    }

    &:active {
      background-color: var(--cc-conversation-preview-background-color--active);
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
      .icon {
        display: flex;
        place-items: center;
        font-size: rem(24px);
        line-height: rem(24px);
        color: var(--t-text-e2-color);
        padding: rem(8px);
      }
    }
  }
</style>
