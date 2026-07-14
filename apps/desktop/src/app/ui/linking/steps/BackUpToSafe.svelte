<script lang="ts">
  import {onMount} from 'svelte';

  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardBackUpToSafeProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {safeBackupRequest, onSkip}: LinkingWizardBackUpToSafeProps = $props();

  /**
   * The minimum Safe-password length enforced on the backup step. The Android OnPrem build requires
   * a password STRICTLY longer than this, so the password must have at least
   * `SAFE_MIN_PASSWORD_LENGTH + 1` characters.
   */
  const SAFE_MIN_PASSWORD_LENGTH = 10;

  /**
   * Returns whether the password satisfies the Android OnPrem Safe-password complexity rule:
   * strictly longer than 10 characters AND containing at least one lowercase letter, one uppercase
   * letter, one digit and one symbol (any non-alphanumeric character).
   *
   * Mirrors the Android `WizardFragment1.meetsComplexity` implementation exactly so a backup created
   * on Desktop is accepted by, and consistent with, the mobile client.
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

  let passwordComponent = $state<SvelteNullableBinding<Password>>(null);

  let password = $state<string>('');
  let confirmation = $state<string>('');
  let customSafeServerUrl = $state<string>('');
  let showErrors = $state<boolean>(false);

  const errors: {passwordComplexity: string | undefined; passwordEquality: string | undefined} =
    $derived({
      passwordComplexity: meetsComplexity(password)
        ? undefined
        : $i18n.t(
            'dialog--linking-safe-backup.error--password-complexity',
            'Password must be longer than 10 characters and contain lowercase, uppercase, a digit and a symbol',
          ),
      passwordEquality:
        password === confirmation
          ? undefined
          : $i18n.t(
              'dialog--linking-safe-backup.error--password-equality',
              'Passwords do not match',
            ),
    });

  function handleInput(): void {
    showErrors = false;
  }

  function handleSubmit(): void {
    showErrors = true;

    const hasAnyError = Object.values(errors).some((value) => value !== undefined);
    if (hasAnyError) {
      return;
    }

    showErrors = false;
    const trimmedCustomServer = customSafeServerUrl.trim();
    safeBackupRequest.resolve({
      password,
      customSafeServerUrl: trimmedCustomServer === '' ? undefined : trimmedCustomServer,
    });
  }

  onMount(() => {
    passwordComponent?.focus();
  });
</script>

<template>
  <Step scrollable={false}>
    <header>
      <h1>
        {$i18n.t('dialog--linking-safe-backup.label--title', 'Back Up to {shortAppName} Safe', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      </h1>
      <p class="intro">
        {$i18n.t(
          'dialog--linking-safe-backup.prose--intro',
          'Set a {shortAppName} Safe password to back up your {shortAppName} ID and data. You will need this password to restore it on another device.',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        )}
      </p>
    </header>

    <div class="body">
      <Password
        bind:this={passwordComponent}
        bind:value={password}
        dir="ltr"
        error={showErrors ? errors.passwordComplexity : undefined}
        label={$i18n.t(
          'dialog--linking-safe-backup.label--password',
          '{shortAppName} Safe password',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
        oninput={handleInput}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            handleSubmit();
          }
        }}
      />
      <Password
        bind:value={confirmation}
        dir="ltr"
        error={showErrors ? errors.passwordEquality : undefined}
        label={$i18n.t('dialog--linking-safe-backup.label--repeat-password', 'Repeat password')}
        oninput={handleInput}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            handleSubmit();
          }
        }}
      />
      <Input
        bind:value={customSafeServerUrl}
        dir="ltr"
        id="safe_backup_custom_server"
        label={$i18n.t(
          'dialog--linking-safe-backup.label--custom-server',
          'Custom Safe server (optional)',
        )}
        oninput={handleInput}
        onpressenter={handleSubmit}
      />
    </div>

    <footer>
      <Button flavor="naked" onclick={onSkip}>
        {$i18n.t('dialog--linking-safe-backup.action--skip', 'Not now')}
      </Button>
      <Button flavor="filled" onclick={handleSubmit}>
        {$i18n.t('dialog--linking-safe-backup.action--backup', 'Back Up Now')}
      </Button>
    </footer>
  </Step>
</template>

<style lang="scss">
  @use 'component' as *;

  h1,
  p {
    padding: 0;
    margin: 0;
  }

  header {
    display: grid;
    gap: rem(8px);
    margin-bottom: rem(24px);

    h1 {
      @extend %font-large-400;
    }

    .intro {
      color: var(--t-text-e2-color);
    }
  }

  .body {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    gap: rem(12px);
    color: var(--t-text-e2-color);
  }

  footer {
    display: grid;
    grid-auto-flow: column;
    justify-content: space-between;
    align-items: end;
    margin-top: rem(48px);
  }
</style>
