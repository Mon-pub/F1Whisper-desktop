<!--
  @component Renders a row of chat-folder filter chips above the conversation list (F1Whisper
  fork, desktop-local).
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {FolderChipsProps} from '~/app/ui/components/partials/conversation-nav/internal/folder-chips/props';
  import {i18n} from '~/app/ui/i18n';

  const {folders, onselect, selectedFolderId}: FolderChipsProps = $props();
</script>

<div class="container">
  <button
    class="chip"
    class:active={selectedFolderId === undefined}
    onclick={() => onselect(undefined)}
  >
    <Text size="body-small" text={$i18n.t('chat-folders.label--all-chats', 'All')} wrap={false} />
  </button>
  {#each folders as folder (folder.id)}
    <button
      class="chip"
      class:active={selectedFolderId === folder.id}
      onclick={() => onselect(folder.id)}
    >
      <Text size="body-small" text={folder.name} wrap={false} />
    </button>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: rem(8px);

    overflow-x: auto;

    .chip {
      @extend %neutral-input;

      flex: 0 0 auto;

      display: flex;
      align-items: center;
      height: rem(28px);
      padding: 0 rem(12px);
      border-radius: rem(14px);
      border: rem(1px) solid var(--ic-divider-background-color);
      cursor: pointer;

      &:hover {
        background-color: var(--cc-menu-item-icon-text-background-color--hover);
      }

      &.active {
        border-color: var(--t-color-primary);
        background-color: var(--t-color-primary);
        color: var(--t-main-background-color);
      }
    }
  }
</style>
