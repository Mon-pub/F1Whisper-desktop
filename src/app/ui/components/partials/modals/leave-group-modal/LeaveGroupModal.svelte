<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {LeaveGroupModalProps} from '~/app/ui/components/partials/modals/leave-group-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.leave-group-modal');

  const {onclose, intent, receiver, services}: LeaveGroupModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function handleSubmit(): void {
    receiver
      .leave()
      .then((success) => {
        if (success) {
          toast.addSimpleSuccess(
            $i18n.t('groups.label--leave-success', 'Successfully left the group'),
          );

          // If we delete the group, we route away.
          if (intent === 'leave-and-delete') {
            services.router.goToWelcome();
          }
          modalComponent?.close();
          return;
        }
        toast.addSimpleFailure($i18n.t('groups.label--leave-error', 'Could not leave the group'));
      })
      .catch((error) => {
        log.error('Leaving the group failed with error:', error);
        toast.addSimpleFailure($i18n.t('groups.label--leave-error', 'Could not leave the group'));
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
        label:
          intent === 'leave'
            ? $i18n.t('groups.action--leave-group', 'Leave Group')
            : $i18n.t('groups.action--leave-delete-group', 'Leave & Delete Group'),
        type: 'filled',
        onclick: handleSubmit,
      },
    ],
    title:
      intent === 'leave'
        ? $i18n.t('groups.label--leave-group-title', 'Leave {groupName}', {
            groupName: receiver.name,
          })
        : $i18n.t(
            'groups.label--leave-and-delete-group-title',
            'Leave and Delete {groupName} permanently',
            {
              groupName: receiver.name,
            },
          ),
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
        'groups.prose--leave',
        'If you leave the group, you can no longer participate in the conversation.',
      )}
    />
    {#if intent === 'leave-and-delete'}
      <Text
        text={$i18n.t(
          'groups.prose--disband-and-delete',
          'Deleting this group chat will remove all messages, media and documents on this device and your linked devices.',
        )}
      />
    {/if}
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px);
  }
</style>
