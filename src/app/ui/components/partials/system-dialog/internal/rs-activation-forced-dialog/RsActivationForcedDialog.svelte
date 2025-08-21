<!--
  @component Renders a system dialog to ask the user whether to install an available app update.
-->
<script lang="ts">
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {RsActivationForcedDialogProps} from '~/app/ui/components/partials/system-dialog/internal/rs-activation-forced-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {onselectaction, previouslyAttemptedPassword}: RsActivationForcedDialogProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);
  let passwordInputComponent = $state<SvelteNullableBinding<Password>>(null);
  let hasError = $state<boolean>(previouslyAttemptedPassword !== undefined);

  let password = $state<string>('');

  function clearError(): void {
    hasError = false;
  }

  function handleClickConfirm(): void {
    onselectaction?.({type: 'confirmed', value: password});
    modalComponent?.close();
  }
</script>

<Modal
  bind:this={modalComponent}
  options={{
    allowClosingWithEsc: true,
    allowSubmittingWithEnter: false,
    overlay: 'opaque',
  }}
  wrapper={{
    type: 'card',
    title: $i18n.t('dialog--rs-activation-forced-dialog.label--title', 'Enter Password'),
    maxWidth: 500,
    buttons: [
      {
        isFocused: false,
        label: $i18n.t('dialog--common.action--submit', 'Submit'),
        onclick: handleClickConfirm,
        type: 'filled',
      },
    ],
  }}
>
  <div class="content">
    <Password
      bind:this={passwordInputComponent}
      bind:value={password}
      error={hasError
        ? $i18n.t(
            'dialog--rs-activation-forced-dialog.error--incorrect-password',
            'The entered password is incorrect. Please try again.',
          )
        : undefined}
      label={$i18n.t('dialog--rs-activation-forced-dialog.label--password', 'App Password')}
      oninput={clearError}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          handleClickConfirm();
        }
      }}
    />
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
