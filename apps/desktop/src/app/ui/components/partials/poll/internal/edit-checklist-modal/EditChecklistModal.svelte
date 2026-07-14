<!--
  @component
  Lets the checklist creator edit its items: add, delete, reorder and rename (F1Whisper fork). The
  working item list is seeded from the current checklist; SURVIVING items keep their `choiceId` (as
  `id`) so their votes are preserved across the merge, and newly added items get a fresh id. On Apply
  the new ordered set is sent via `receiver.editChecklist`, which re-broadcasts the poll-setup so all
  participants merge it in place (no new message bubble).
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import ChecklistItemsEditor from '~/app/ui/components/partials/modals/create-poll-modal/internal/checklist-items-editor/ChecklistItemsEditor.svelte';
  import type {EditChecklistModalProps} from '~/app/ui/components/partials/poll/internal/edit-checklist-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {extractErrorMessage} from '~/common/error';
  import type {u53} from '~/common/types';
  import {ensureError} from '~/common/utils/assert';

  const log = globals.unwrap().uiLogging.logger('ui.component.edit-checklist-modal');

  const {pollData, receiver, onclose}: EditChecklistModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  // Seed from the current choices, keeping each surviving item's `choiceId` as its working `id` so
  // votes survive the merge.
  let items = $state<{description: string; id: u53}[]>(
    pollData.choices.map((choice) => ({
      description: choice.description,
      id: choice.choiceId,
    })),
  );

  const hasValidItem = $derived(items.some((item) => item.description.trim() !== ''));

  function handleSubmit(): void {
    const choices = items
      .filter((item) => item.description.trim() !== '')
      .map((item) => ({choiceId: item.id, description: item.description}));

    if (choices.length === 0) {
      return;
    }

    receiver
      .editChecklist({
        pollCreatorIdentity: pollData.pollCreatorIdentity,
        pollId: pollData.pollId,
        choices,
      })
      .catch((error: unknown) => {
        log.error(`Error editing checklist: ${extractErrorMessage(ensureError(error), 'short')}`);
        toast.addSimpleFailure(
          $i18n.t('dialog--edit-checklist.error--apply', 'Editing the checklist failed'),
        );
      });
    modalComponent?.close();
  }
</script>

<Modal
  bind:this={modalComponent}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    buttons: [
      {
        label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
        type: 'naked',
        onclick: 'close',
      },
      {
        label: $i18n.t('dialog--edit-checklist.action--apply', 'Apply'),
        type: 'filled',
        onclick: handleSubmit,
        disabled: !hasValidItem,
      },
    ],
    title: $i18n.t('dialog--edit-checklist.label--title', 'Edit Checklist'),
    minWidth: 340,
    maxWidth: 460,
  }}
  options={{
    allowClosingWithEsc: true,
    allowSubmittingWithEnter: true,
  }}
  {onclose}
  onsubmit={handleSubmit}
>
  <div class="content">
    <ChecklistItemsEditor
      bind:items
      minItems={1}
      headerLabel={$i18n.t('dialog--edit-checklist.label--items', 'Items')}
      itemLabel={$i18n.t('dialog--edit-checklist.action--add-item', 'Add item')}
    />
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px) rem(16px) rem(16px);
  }
</style>
