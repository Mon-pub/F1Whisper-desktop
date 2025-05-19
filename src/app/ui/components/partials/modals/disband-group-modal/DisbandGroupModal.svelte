<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {DisbandGroupModalProps} from '~/app/ui/components/partials/modals/disband-group-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.disband-group-modal');

  const {onclose, intent, receiver, services}: DisbandGroupModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function handleSubmit(): void {
    receiver
      .disband()
      .then((success) => {
        if (success) {
          toast.addSimpleSuccess(
            $i18n.t('groups.label--disband-success', 'Successfully dissolved the group'),
          );

          // If we delete the group, we route away.
          if (intent === 'disband-and-delete') {
            services.router.goToWelcome();
          }
          modalComponent?.close();
          return;
        }
        toast.addSimpleFailure(
          $i18n.t('groups.label--dissolve-error', 'Could not dissolve the group'),
        );
      })
      .catch((error) => {
        log.error('Disbanding the group failed with error:', error);
        toast.addSimpleFailure(
          $i18n.t('groups.label--dissolve-error', 'Could not dissolve the group'),
        );
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
          intent === 'disband'
            ? $i18n.t('groups.action--disband-group', 'Dissolve Group')
            : $i18n.t('groups.action--disband-delete-group', 'Dissolve and Delete Group'),
        type: 'filled',
        onclick: handleSubmit,
      },
    ],
    title:
      intent === 'disband'
        ? $i18n.t('groups.label--dissolve-group-title', 'Dissolve {groupName}', {
            groupName: receiver.name,
          })
        : $i18n.t(
            'groups.label--dissolve-and-delete-group-title',
            'Dissolve and Delete {groupName} permanently',
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
        'groups.prose--disband',
        'If you dissolve the group, it can no longer be used or managed by anyone.',
      )}
    />
    {#if intent === 'disband-and-delete'}
      <Text
        text={$i18n.t(
          'groups.prose--disband-and-delete',
          'Deleting this group chat will remove all messages, media, and documents from this device and your linked devices.',
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
