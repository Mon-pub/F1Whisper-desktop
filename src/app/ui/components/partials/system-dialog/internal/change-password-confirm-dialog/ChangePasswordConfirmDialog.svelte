<!--
  @component Renders a system dialog to ask the user whether to install an available app update.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {ChangePasswordConfirmDialogProps} from '~/app/ui/components/partials/system-dialog/internal/change-password-confirm-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {onclose, onselectaction}: ChangePasswordConfirmDialogProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function handleClickDismiss(): void {
    onselectaction?.('dismissed');
    modalComponent?.close();
  }

  function handleClickConfirm(): void {
    onselectaction?.('confirmed');
    modalComponent?.close();
  }
</script>

<Modal
  bind:this={modalComponent}
  {onclose}
  options={{
    allowClosingWithEsc: true,
    allowSubmittingWithEnter: false,
    overlay: 'opaque',
  }}
  wrapper={{
    type: 'card',
    title: $i18n.t('dialog--change-password-confirmation.label--title', 'Change Password'),
    maxWidth: 500,
    buttons: [
      {
        isFocused: true,
        label: $i18n.t('dialog--common.action--back', 'Back'),
        onclick: handleClickDismiss,
        type: 'naked',
      },
      {
        isFocused: false,
        label: $i18n.t('dialog--common.action--confirm-and-restart', 'Confirm and Restart'),
        onclick: handleClickConfirm,
        type: 'filled',
      },
    ],
  }}
>
  <div class="content">
    <p>
      <Text
        text={$i18n.t(
          'dialog--change-password-confirmation.prose--intro',
          '{shortAppName} for Desktop must be re-launched to save your changes.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      />
    </p>
    <p>
      <strong>
        <Text
          text={$i18n.t(
            'dialog--change-password-confirmation.prose--note',
            'Please note: You will need to re-authenticate with your new password.',
          )}
        />
      </strong>
    </p>
    <p>
      <Text
        text={$i18n.t(
          'dialog--change-password-confirmation.prose--description',
          'Please ensure you have this password on hand. It cannot be reset if you forget it. You can opt to save your password when you log back in.',
        )}
      />
    </p>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px);

    p:first-child {
      margin-top: 0;
    }

    p:last-child {
      margin-bottom: 0;
    }
  }
</style>
