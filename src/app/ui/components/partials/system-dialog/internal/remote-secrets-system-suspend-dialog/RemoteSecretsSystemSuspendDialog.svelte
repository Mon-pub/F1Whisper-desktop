<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {RemoteSecretsSystemSuspendDialogProps} from '~/app/ui/components/partials/system-dialog/internal/remote-secrets-system-suspend-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {onselectaction}: RemoteSecretsSystemSuspendDialogProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function handleClickConfirm(): void {
    onselectaction?.({type: 'confirmed'});
    modalComponent?.close();
  }
</script>

<Modal
  bind:this={modalComponent}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: false,
    overlay: 'opaque',
  }}
  wrapper={{
    type: 'card',
    title: $i18n.t(
      'dialog--remote-secrets-system-suspend-dialog.label--title',
      'System Suspension Detected',
    ),
    maxWidth: 500,
    buttons: [
      {
        label: $i18n.t('dialog--common.action--continue'),
        onclick: handleClickConfirm,
        type: 'filled',
      },
    ],
  }}
>
  <div class="content">
    <div class="description">
      <Text
        text={$i18n.t(
          'dialog--remote-secrets-system-suspend-dialog.prose--description',
          'Threema Desktop was locked to protect your data while your device was suspended.',
        )}
      ></Text>
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px);

    .description {
      padding-bottom: rem(24px);
    }
  }
</style>
