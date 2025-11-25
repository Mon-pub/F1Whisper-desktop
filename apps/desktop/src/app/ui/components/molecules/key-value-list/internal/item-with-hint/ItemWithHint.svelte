<!--
  @component Renders an item of a `KeyValueList` that contains a hint.
-->
<script lang="ts">
  import Hint from '~/app/ui/components/atoms/hint/Hint.svelte';
  import type {ItemWithHintProps} from '~/app/ui/components/molecules/key-value-list/internal/item-with-hint/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {children, key, hint, icon}: ItemWithHintProps = $props();
</script>

<div class="item">
  <div class="left">
    <div class="header">
      <div class="key">{key}</div>
    </div>
    <div class="value">
      {@render children?.()}
    </div>
  </div>

  <div class="right">
    <Hint id={crypto.randomUUID()} text={hint}>
      <span class="icon">
        <MdIcon theme="Outlined">{icon}</MdIcon>
      </span>
    </Hint>
  </div>
</div>

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

    &:disabled {
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      background-color: var(--cc-conversation-preview-background-color--hover);
    }

    &:active:not(:disabled) {
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
