<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {DeleteGroupModalProps} from '~/app/ui/components/partials/modals/delete-group-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.delete-group-modal');

  const {onclose, receiver}: DeleteGroupModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function handleSubmit(): void {
    receiver
      .delete()
      .then((success) => {
        if (success) {
          toast.addSimpleSuccess(
            $i18n.t('groups.label--delete-success', 'Successfully deleted the group'),
          );
          modalComponent?.close();
          return;
        }
        toast.addSimpleFailure($i18n.t('groups.label--delete-error', 'Could not delete the group'));
      })
      .catch((error) => {
        log.error('Deleting the group failed with error:', error);
        toast.addSimpleFailure($i18n.t('groups.label--delete-error', 'Could not delete the group'));
      });
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
        label: $i18n.t('groups.action--delete', 'Delete Group'),
        type: 'filled',
        onclick: handleSubmit,
      },
    ],
    title: $i18n.t('groups.label--delete-group-title', 'Delete {groupName}', {
      groupName: receiver.name,
    }),
    minWidth: 280,
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
    <Text
      text={$i18n.t(
        'groups.prose--delete',
        'If you delete the group, the group chat and its content will be permanently deleted.',
      )}
    />
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px);
  }
</style>
