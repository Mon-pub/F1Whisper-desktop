<!--
  @component
  Renders an editable, reorderable list of poll/checklist items. Each row has a text input plus
  move-up, move-down and delete buttons; a header with an add button sits above the list. The array
  order is the display order, so reordering simply swaps neighbouring entries. RTL is handled
  automatically by the app's flex direction flip. Shared by the create-poll form and the
  edit-checklist modal.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {ChecklistItemsEditorProps} from '~/app/ui/components/partials/modals/create-poll-modal/internal/checklist-items-editor/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import Input from '~/app/ui/svelte-components/blocks/Input/Text.svelte';
  import type {u53} from '~/common/types';

  let {
    items = $bindable(),
    minItems = 2,
    headerLabel,
    itemLabel,
    onmutate,
  }: ChecklistItemsEditorProps = $props();

  function onClickAddItem(): void {
    const currentMaxId = items.length === 0 ? 0 : Math.max(...items.map((item) => item.id));
    items.push({description: '', id: currentMaxId + 1});
    onmutate?.();
  }

  function onClickRemoveItem(id: u53): void {
    if (items.length <= minItems) {
      return;
    }
    items = items.filter((item) => item.id !== id);
    onmutate?.();
  }

  /**
   * Move the item at `index` by `offset` (`-1` = up, `+1` = down) by swapping it with its
   * neighbour. Reassigns the `items` array so Svelte tracks the reorder.
   */
  function onClickMoveItem(index: u53, offset: -1 | 1): void {
    const target = index + offset;
    if (target < 0 || target >= items.length) {
      return;
    }
    const reordered = [...items];
    const moved = reordered[index];
    const neighbour = reordered[target];
    if (moved === undefined || neighbour === undefined) {
      return;
    }
    reordered[index] = neighbour;
    reordered[target] = moved;
    items = reordered;
    onmutate?.();
  }
</script>

<div class="items">
  <div class="header">
    <Text text={headerLabel} size="body-large" />
    <IconButton flavor="naked" onclick={onClickAddItem}>
      <MdIcon theme="Outlined">add_circle</MdIcon>
    </IconButton>
  </div>
  {#each items as item, index (item.id)}
    <div class="item">
      <div class="input">
        <Input bind:value={item.description} label={itemLabel} spellcheck={false} oninput={onmutate} />
      </div>
      <div class="reorder">
        <IconButton
          flavor="naked"
          disabled={index === 0}
          title={$i18n.t('dialog--create-poll-message.action--move-up', 'Move up')}
          onclick={() => onClickMoveItem(index, -1)}
        >
          <MdIcon theme="Outlined">keyboard_arrow_up</MdIcon>
        </IconButton>
        <IconButton
          flavor="naked"
          disabled={index === items.length - 1}
          title={$i18n.t('dialog--create-poll-message.action--move-down', 'Move down')}
          onclick={() => onClickMoveItem(index, 1)}
        >
          <MdIcon theme="Outlined">keyboard_arrow_down</MdIcon>
        </IconButton>
      </div>
      <div class="delete">
        <IconButton
          flavor="naked"
          disabled={items.length <= minItems}
          onclick={() => onClickRemoveItem(item.id)}
        >
          <MdIcon theme="Outlined">delete</MdIcon>
        </IconButton>
      </div>
    </div>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .items {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;

    padding: rem(16px) 0 0 0;

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      margin-bottom: rem(8px);
    }

    .item {
      display: flex;
      align-items: center;
      justify-content: stretch;

      gap: rem(4px);

      .input {
        flex: 1 1 auto;
      }

      .reorder {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
      }

      .delete {
        flex: 0 0 auto;
      }
    }
  }
</style>
