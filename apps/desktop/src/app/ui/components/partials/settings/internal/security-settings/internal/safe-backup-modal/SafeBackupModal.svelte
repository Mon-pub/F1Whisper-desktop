<!--
  @component Renders a modal to create an on-demand {shortAppName} Safe backup from Settings
  (F1Whisper fork, FU-M12). Reuses the same password-complexity rule and copy as the onboarding
  backup step, plus a current-password re-auth field (the raw private key needed for the backup is
  only briefly available in the backend after re-decrypting the key storage; the running app never
  retains it).
-->
<script lang="ts">
  import {onMount} from 'svelte';

  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {SafeBackupModalProps} from '~/app/ui/components/partials/settings/internal/security-settings/internal/safe-backup-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {unreachable} from '~/common/utils/assert';

  const {onclose, services}: SafeBackupModalProps = $props();

  /**
   * The minimum Safe-password length enforced here. The Android OnPrem build requires a password
   * STRICTLY longer than this, so the password must have at least
   * `SAFE_MIN_PASSWORD_LENGTH + 1` characters.
   */
  const SAFE_MIN_PASSWORD_LENGTH = 10;

  /**
   * Returns whether the password satisfies the Android OnPrem Safe-password complexity rule:
   * strictly longer than 10 characters AND containing at least one lowercase letter, one uppercase
   * letter, one digit and one symbol (any non-alphanumeric character).
   *
   * Mirrors `BackUpToSafe.svelte`'s (onboarding) `meetsComplexity` exactly so a backup created here
   * is accepted by, and consistent with, the mobile client.
   */
  function meetsComplexity(pw: string): boolean {
    if (pw.length <= SAFE_MIN_PASSWORD_LENGTH) {
      return false;
    }
    let hasLower = false;
    let hasUpper = false;
    let hasDigit = false;
    let hasSymbol = false;
    for (const char of pw) {
      if (char >= 'a' && char <= 'z') {
        hasLower = true;
      } else if (char >= 'A' && char <= 'Z') {
        hasUpper = true;
      } else if (char >= '0' && char <= '9') {
        hasDigit = true;
      } else {
        hasSymbol = true;
      }
    }
    return hasLower && hasUpper && hasDigit && hasSymbol;
  }

  let currentPasswordComponent = $state<SvelteNullableBinding<Password>>(null);

  let currentPassword = $state<string>('');
  let safePassword = $state<string>('');
  let safePasswordConfirmation = $state<string>('');
  let customSafeServerUrl = $state<string>('');
  let showErrors = $state<boolean>(false);
  let isCurrentPasswordCorrect = $state<boolean>(true);
  let isSubmitting = $state<boolean>(false);

  const errors: {
    readonly currentPasswordPresent: string | undefined;
    readonly currentPasswordIncorrect: string | undefined;
    readonly passwordComplexity: string | undefined;
    readonly passwordEquality: string | undefined;
  } = $derived({
    currentPasswordPresent:
      currentPassword.length >= 1
        ? undefined
        : $i18n.t(
            'dialog--change-password.error--current-password-present',
            'Please enter your current password',
          ),
    currentPasswordIncorrect: isCurrentPasswordCorrect
      ? undefined
      : $i18n.t(
          'dialog--change-password.error--current-password-incorrect',
          'Your current password is incorrect',
        ),
    passwordComplexity: meetsComplexity(safePassword)
      ? undefined
      : $i18n.t(
          'dialog--linking-safe-backup.error--password-complexity',
          'Password must be longer than 10 characters and contain lowercase, uppercase, a digit and a symbol',
        ),
    passwordEquality:
      safePassword === safePasswordConfirmation
        ? undefined
        : $i18n.t('dialog--linking-safe-backup.error--password-equality', 'Passwords do not match'),
  });

  const hasAnyError = $derived(Object.values(errors).some((error) => error !== undefined));

  function handleInput(): void {
    showErrors = false;
    isCurrentPasswordCorrect = true;
  }

  async function handleSubmit(): Promise<void> {
    showErrors = true;
    if (hasAnyError) {
      return;
    }

    isSubmitting = true;
    try {
      const trimmedCustomServer = customSafeServerUrl.trim();
      const result = await services.backend.createSafeBackupNow(currentPassword, {
        password: safePassword,
        customSafeServerUrl: trimmedCustomServer === '' ? undefined : trimmedCustomServer,
      });

      if (result.ok) {
        toast.addSimpleSuccess(
          $i18n.t(
            'dialog--linking-create-success.prose--safe-backup-success',
            'Backed up to {shortAppName} Safe.',
            {shortAppName: import.meta.env.SHORT_APP_NAME},
          ),
        );
        onclose?.(undefined);
        return;
      }

      switch (result.reason) {
        case 'wrong-password':
          isCurrentPasswordCorrect = false;
          break;
        case 'upload-failed':
          toast.addSimpleFailure(
            $i18n.t(
              'dialog--safe-backup.error--upload-failed',
              'Backup didn’t complete. Please check your connection and try again.',
            ),
          );
          break;
        default:
          unreachable(result.reason);
      }
    } finally {
      isSubmitting = false;
    }
  }

  onMount(() => {
    currentPasswordComponent?.focus();
  });
</script>

<Modal
  {onclose}
  options={{allowSubmittingWithEnter: true}}
  onsubmit={handleSubmit}
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
        disabled: isSubmitting,
      },
      {
        label: $i18n.t('dialog--linking-safe-backup.action--backup', 'Back Up Now'),
        type: 'filled',
        onclick: 'submit',
        disabled: isSubmitting,
      },
    ],
    title: $i18n.t('dialog--linking-safe-backup.label--title', 'Back Up to {shortAppName} Safe', {
      shortAppName: import.meta.env.SHORT_APP_NAME,
    }),
    maxWidth: 420,
  }}
>
  <div class="content">
    <p class="intro">
      {$i18n.t(
        'dialog--linking-safe-backup.prose--intro',
        'Set a {shortAppName} Safe password to back up your {shortAppName} ID. This password lets you restore your ID on another device. Contacts, chats, and settings are not included.',
        {shortAppName: import.meta.env.SHORT_APP_NAME},
      )}
    </p>

    <div class="form">
      <Password
        bind:this={currentPasswordComponent}
        bind:value={currentPassword}
        dir="ltr"
        disabled={isSubmitting}
        error={showErrors
          ? (errors.currentPasswordIncorrect ?? errors.currentPasswordPresent)
          : undefined}
        label={$i18n.t('dialog--change-password.label--current-password', 'Current Password')}
        oninput={handleInput}
      />
      <Password
        bind:value={safePassword}
        dir="ltr"
        disabled={isSubmitting}
        error={showErrors ? errors.passwordComplexity : undefined}
        label={$i18n.t(
          'dialog--linking-safe-backup.label--password',
          '{shortAppName} Safe password',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        )}
        oninput={handleInput}
      />
      <Password
        bind:value={safePasswordConfirmation}
        dir="ltr"
        disabled={isSubmitting}
        error={showErrors ? errors.passwordEquality : undefined}
        label={$i18n.t('dialog--linking-safe-backup.label--repeat-password', 'Repeat password')}
        oninput={handleInput}
      />
      <Input
        bind:value={customSafeServerUrl}
        dir="ltr"
        disabled={isSubmitting}
        id="safe_backup_now_custom_server"
        label={$i18n.t(
          'dialog--linking-safe-backup.label--custom-server',
          'Custom Safe server (optional)',
        )}
        oninput={handleInput}
      />
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    @extend %font-normal-400;

    max-width: rem(420px);
    padding: 0 rem(16px) rem(16px);
    display: grid;
    gap: rem(16px);

    .intro {
      margin: 0;
      color: var(--t-text-e2-color);
    }

    .form {
      display: grid;
      gap: rem(24px);

      :global([data-error='true']) {
        margin-bottom: rem(-18px);
      }
    }
  }
</style>
