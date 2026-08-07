<!--
  @component Renders a modal to create, rename, and delete chat folders, and to assign
  conversations to a folder (F1Whisper fork, desktop-local, not synced).
-->
<script lang="ts">
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {ManageFoldersModalProps} from '~/app/ui/components/partials/modals/manage-folders-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import Checkbox from '~/app/ui/svelte-components/blocks/Checkbox/Checkbox.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {receiverLookupKey, type ChatFolder} from '~/common/dom/ui/local-storage';

  const {conversations, onclose, services}: ManageFoldersModalProps = $props();

  const {chatFolders, chatFolderMembers, chatFolderPersistenceAvailable} = services.storage;

  let newFolderName = $state('');
  let renamingFolderId = $state<string | undefined>(undefined);
  let renameValue = $state('');
  let assigningFolderId = $state<string | undefined>(undefined);

  const assigningFolder = $derived($chatFolders.find((folder) => folder.id === assigningFolderId));

  /**
   * Generate a locally-unique folder id. Not a security-relevant identifier, just a stable key for
   * local storage.
   */
  function generateFolderId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function handleAddFolder(): void {
    const name = newFolderName.trim();
    if (name === '') {
      return;
    }
    $chatFolders = [...$chatFolders, {id: generateFolderId(), name}];
    newFolderName = '';
  }

  function handleStartRename(folder: ChatFolder): void {
    renamingFolderId = folder.id;
    renameValue = folder.name;
  }

  function handleCommitRename(): void {
    const name = renameValue.trim();
    if (renamingFolderId === undefined) {
      return;
    }
    if (name !== '') {
      $chatFolders = $chatFolders.map((folder) =>
        folder.id === renamingFolderId ? {...folder, name} : folder,
      );
    }
    renamingFolderId = undefined;
  }

  function handleDeleteFolder(folder: ChatFolder): void {
    $chatFolders = $chatFolders.filter((existing) => existing.id !== folder.id);

    // Drop the deleted folder from every conversation's membership list.
    const members: Record<string, readonly string[]> = {};
    for (const [key, folderIds] of Object.entries($chatFolderMembers)) {
      const filtered = folderIds.filter((id) => id !== folder.id);
      if (filtered.length > 0) {
        members[key] = filtered;
      }
    }
    $chatFolderMembers = members;

    if (assigningFolderId === folder.id) {
      assigningFolderId = undefined;
    }
  }

  function isConversationInFolder(lookupKey: string, folderId: string): boolean {
    return ($chatFolderMembers[lookupKey] ?? []).includes(folderId);
  }

  function handleToggleConversation(lookupKey: string, folderId: string, checked: boolean): void {
    const current = $chatFolderMembers[lookupKey] ?? [];
    const next = checked ? [...current, folderId] : current.filter((id) => id !== folderId);
    $chatFolderMembers = {
      ...$chatFolderMembers,
      [lookupKey]: next,
    };
  }
</script>

<Modal
  {onclose}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    maxWidth: 460,
    title: $i18n.t('dialog--manage-folders.label--title', 'Manage Folders'),
  }}
>
  {#if !$chatFolderPersistenceAvailable}
    <div class="content unavailable" role="status">
      <Text color="mono-low" text={$i18n.t('settings.error--settings-update')} />
    </div>
  {:else if assigningFolder === undefined}
    <div class="content">
      {#if $chatFolders.length === 0}
        <Text
          color="mono-low"
          text={$i18n.t('dialog--manage-folders.prose--no-folders', 'No folders yet')}
        />
      {/if}
      <ul class="folders">
        {#each $chatFolders as folder (folder.id)}
          <li class="folder">
            {#if renamingFolderId === folder.id}
              <div class="rename">
                <Input
                  bind:value={renameValue}
                  autofocus
                  id={`rename-folder-${folder.id}`}
                  onpressenter={handleCommitRename}
                />
              </div>
              <IconButton flavor="naked" onclick={handleCommitRename}>
                <MdIcon theme="Outlined">check</MdIcon>
              </IconButton>
            {:else}
              <button
                class="name"
                onclick={() => (assigningFolderId = folder.id)}
                title={$i18n.t(
                  'dialog--manage-folders.action--assign-conversations',
                  'Choose conversations for this folder',
                )}
              >
                <MdIcon theme="Outlined">folder</MdIcon>
                <Text text={folder.name} wrap={false} />
              </button>
              <IconButton flavor="naked" onclick={() => handleStartRename(folder)}>
                <MdIcon theme="Outlined">edit</MdIcon>
              </IconButton>
            {/if}
            <IconButton flavor="naked" onclick={() => handleDeleteFolder(folder)}>
              <MdIcon theme="Outlined">delete</MdIcon>
            </IconButton>
          </li>
        {/each}
      </ul>
      <div class="add">
        <Input
          bind:value={newFolderName}
          id="new-folder-name"
          label={$i18n.t('dialog--manage-folders.label--new-folder-name', 'New Folder Name')}
          onpressenter={handleAddFolder}
        />
        <IconButton disabled={newFolderName.trim() === ''} flavor="naked" onclick={handleAddFolder}>
          <MdIcon theme="Filled">add</MdIcon>
        </IconButton>
      </div>
    </div>
  {:else}
    {@const folder = assigningFolder}
    <div class="content">
      <button class="back" onclick={() => (assigningFolderId = undefined)}>
        <MdIcon theme="Outlined">arrow_back</MdIcon>
        <Text text={folder.name} wrap={false} />
      </button>
      {#if conversations.length === 0}
        <Text
          color="mono-low"
          text={$i18n.t(
            'dialog--manage-folders.prose--no-conversations',
            'No conversations available',
          )}
        />
      {/if}
      <ul class="conversations">
        {#each conversations as conversation (receiverLookupKey(conversation.lookup))}
          {@const lookupKey = receiverLookupKey(conversation.lookup)}
          <li class="conversation">
            <button
              class="row"
              onclick={() =>
                handleToggleConversation(
                  lookupKey,
                  folder.id,
                  !isConversationInFolder(lookupKey, folder.id),
                )}
            >
              <Checkbox
                checked={isConversationInFolder(lookupKey, folder.id)}
                oncheck={(checked) => handleToggleConversation(lookupKey, folder.id, checked)}
              />
              <Text text={conversation.name} wrap={false} />
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    gap: rem(8px);

    padding: 0 rem(16px) rem(16px);
    max-height: rem(460px);
    overflow-y: auto;

    &.unavailable {
      padding-top: rem(8px);
    }

    .folders,
    .conversations {
      display: flex;
      flex-direction: column;
      gap: rem(4px);

      list-style: none;
      margin: 0;
      padding: 0;
    }

    .folder {
      display: flex;
      align-items: center;
      gap: rem(4px);

      .name {
        @extend %neutral-input;

        flex: 1 1 auto;
        min-width: 0;

        display: flex;
        align-items: center;
        gap: rem(8px);
        padding: rem(8px);
        border-radius: rem(8px);
        cursor: pointer;

        &:hover {
          background-color: var(--cc-menu-item-icon-text-background-color--hover);
        }
      }

      .rename {
        flex: 1 1 auto;
        min-width: 0;
      }
    }

    .add {
      display: flex;
      align-items: end;
      gap: rem(4px);

      padding-top: rem(8px);
    }

    .back {
      @extend %neutral-input;

      display: flex;
      align-items: center;
      gap: rem(8px);
      padding: rem(8px) 0;
      cursor: pointer;
      color: var(--t-color-primary);
    }

    .conversation {
      .row {
        @extend %neutral-input;

        display: flex;
        align-items: center;
        gap: rem(8px);
        width: 100%;
        padding: rem(8px);
        border-radius: rem(8px);
        cursor: pointer;

        &:hover {
          background-color: var(--cc-menu-item-icon-text-background-color--hover);
        }
      }
    }
  }
</style>
