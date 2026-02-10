<script lang="ts">
  import {tick} from 'svelte';

  import {APP_CONFIG} from '~/app/config';
  import type {AppServicesForSvelte} from '~/app/types';
  import {i18n} from '~/app/ui/i18n';
  import ModalWrapper from '~/app/ui/modal/ModalWrapper.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import Title from '~/app/ui/svelte-components/blocks/ModalDialog/Header/Title.svelte';
  import ModalDialog from '~/app/ui/svelte-components/blocks/ModalDialog/ModalDialog.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {KeyStorageError} from '~/common/key-storage';
  import {assertError, assertUnreachable, unreachable} from '~/common/utils/assert';

  interface Props {
    readonly services: AppServicesForSvelte;
  }

  const {services}: Props = $props();

  const {router, backend} = services;

  let currentPasswordInputComponent = $state<SvelteNullableBinding<Password>>(null);

  let currentPassword = $state<string>('');
  let newPassword = $state<string>('');
  let passwordConfirmation = $state<string>('');
  let showErrors = $state<boolean>(false);
  let isCurrentPasswordCorrect = $state<boolean>(true);
  let isAttemptingToChangePassword = $state<boolean>(false);
  const errors = $derived<{
    readonly newPasswordMustBeDifferent: string | undefined;
    readonly currentPasswordPresent: string | undefined;
    readonly currentPasswordIsIncorrect: string | undefined;
    readonly minPasswordLength: string | undefined;
    readonly passwordEquality: string | undefined;
  }>({
    newPasswordMustBeDifferent:
      currentPassword !== newPassword
        ? undefined
        : $i18n.t(
            'dialog--change-password.error--new-password-must-be-different',
            'New password must be different from the old one.',
          ),
    currentPasswordPresent:
      currentPassword.length >= 1
        ? undefined
        : $i18n.t(
            'dialog--change-password.error--current-password-present',
            'Please enter your current password',
          ),
    currentPasswordIsIncorrect: isCurrentPasswordCorrect
      ? undefined
      : $i18n.t(
          'dialog--change-password.error--current-password-incorrect',
          'Your current password is incorrect',
        ),
    minPasswordLength:
      newPassword.length >= APP_CONFIG.MIN_PASSWORD_LENGTH
        ? undefined
        : $i18n.t(
            'dialog--change-password.error--password-length',
            'Please enter at least {n, plural, =1 {1 character} other {# characters}}',
            {n: APP_CONFIG.MIN_PASSWORD_LENGTH},
          ),
    passwordEquality:
      newPassword === passwordConfirmation
        ? undefined
        : $i18n.t('dialog--change-password.error--password-equality', 'Passwords do not match'),
  });

  async function attemptPasswordChange(): Promise<boolean> {
    isAttemptingToChangePassword = true;
    try {
      await backend.keyStorage.changePassword(currentPassword, newPassword);
      isCurrentPasswordCorrect = true;
    } catch (error) {
      assertError(error, KeyStorageError);
      switch (error.type) {
        case 'undecryptable':
          isCurrentPasswordCorrect = false;
          break;
        case 'not-found':
        case 'malformed':
        case 'invalid':
        case 'internal-error':
        case 'not-writable':
        case 'not-readable':
        case 'migration-error':
          // TODO(DESK-383): Assume a permission issue. This cannot be solved by
          //     overwriting. Gracefully return to the UI and notify the user.
          isCurrentPasswordCorrect = false;
          break;
        default:
          unreachable(error.type);
      }
    } finally {
      isAttemptingToChangePassword = false;
    }
    return isCurrentPasswordCorrect;
  }

  function handleInput(): void {
    showErrors = false;
    isCurrentPasswordCorrect = true;
  }

  async function handleSubmit(event?: MouseEvent): Promise<void> {
    event?.preventDefault();
    showErrors = true;
    if (hasAnyError) {
      return;
    }
    const promptDialogHandle = services.systemDialog.open({
      type: 'change-password-confirm-dialog',
    });
    const promptAction = await promptDialogHandle.closed;
    if (promptAction.type === 'confirmed' && (await attemptPasswordChange())) {
      services.electron.restartApp();
    }
  }

  $effect(() => {
    if (!isCurrentPasswordCorrect) {
      tick()
        .then(() => currentPasswordInputComponent?.focusAndSelect())
        .catch(assertUnreachable);
    }
  });

  const hasAnyError = $derived<boolean>(Object.values(errors).some((error) => error !== undefined));

  function closeModal(event?: MouseEvent): void {
    event?.preventDefault();
    if (isAttemptingToChangePassword) {
      return;
    }
    router.go({modal: 'close'});
  }
</script>

<template>
  <ModalWrapper visible={true}>
    <ModalDialog onclose={closeModal} visible={true}>
      {#snippet snippetHeader()}
        <Title title={$i18n.t('dialog--change-password.label--title', 'Change Password')} />
      {/snippet}

      {#snippet snippetBody()}
        <div class="body">
          <p class="intro">
            {$i18n.t(
              'dialog--change-password.prose--intro',
              'The password protects your messages, {shortAppName} ID and other data on this computer. You have to enter it when starting {shortAppName} for Desktop. Please note that there is no way to recover this password. If you forget it, you will have to link this device again.',
              {
                shortAppName: import.meta.env.SHORT_APP_NAME,
              },
            )}
          </p>

          <div class="form">
            <Password
              bind:this={currentPasswordInputComponent}
              bind:value={currentPassword}
              disabled={isAttemptingToChangePassword}
              error={showErrors
                ? (errors.currentPasswordIsIncorrect ?? errors.currentPasswordPresent)
                : undefined}
              label={$i18n.t('dialog--change-password.label--current-password', 'Current Password')}
              oninput={handleInput}
              onkeydown={async (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  await handleSubmit();
                }
              }}
            />
            <Password
              bind:value={newPassword}
              disabled={isAttemptingToChangePassword}
              error={showErrors
                ? (errors.minPasswordLength ?? errors.newPasswordMustBeDifferent)
                : undefined}
              label={$i18n.t('dialog--change-password.label--new-password', 'New Password')}
              oninput={handleInput}
              onkeydown={async (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  await handleSubmit();
                }
              }}
            />
            <Password
              bind:value={passwordConfirmation}
              disabled={isAttemptingToChangePassword}
              error={showErrors ? errors.passwordEquality : undefined}
              label={$i18n.t(
                'dialog--change-password.label--repeat-new-password',
                'Repeat New Password',
              )}
              oninput={handleInput}
              onkeydown={async (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  await handleSubmit();
                }
              }}
            />
          </div>
        </div>
      {/snippet}

      {#snippet snippetFooter()}
        <div class="footer">
          <Button flavor="naked" onclick={closeModal} disabled={isAttemptingToChangePassword}
            >{$i18n.t('dialog--common.action--cancel', 'Cancel')}
          </Button>
          <Button flavor="filled" onclick={handleSubmit}
            >{$i18n.t('dialog--common.action--confirm', 'Confirm')}
          </Button>
        </div>
      {/snippet}
    </ModalDialog>
  </ModalWrapper>
</template>

<style lang="scss">
  @use 'component' as *;

  .body {
    @extend %font-normal-400;

    max-width: rem(400px);

    padding: rem(16px);
    display: grid;
    gap: rem(16px);

    .form {
      display: grid;
      gap: rem(32px);

      :global([data-error='true']) {
        margin-bottom: rem(-18px);
      }
    }
  }

  .footer {
    padding: rem(16px);
    display: grid;
    grid-template: 'cancel ok' auto / 1fr auto;
    column-gap: rem(8px);
    justify-items: end;
  }
</style>
