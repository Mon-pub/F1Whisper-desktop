<script lang="ts">
  import {onMount} from 'svelte';

  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardRestoreFromSafeProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';

  const {safeRestoreCredentials}: LinkingWizardRestoreFromSafeProps = $props();

  /** A Threema ID is always exactly 8 characters long. */
  const IDENTITY_LENGTH = 8;

  let identityInputComponent = $state<Input>();

  let identity = $state<string>('');
  let password = $state<string>('');
  let customSafeServerUrl = $state<string>('');
  let showErrors = $state<boolean>(false);

  const errors: {identity: string | undefined; password: string | undefined} = $derived({
    identity:
      identity.trim().length === IDENTITY_LENGTH
        ? undefined
        : $i18n.t(
            'dialog--linking-safe-restore.error--identity-length',
            'Please enter a valid 8-character {shortAppName} ID.',
            {shortAppName: import.meta.env.SHORT_APP_NAME},
          ),
    password:
      password.length > 0
        ? undefined
        : $i18n.t(
            'dialog--linking-safe-restore.error--password-required',
            'Please enter your {shortAppName} Safe password.',
            {shortAppName: import.meta.env.SHORT_APP_NAME},
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
    safeRestoreCredentials.resolve({
      identity: identity.trim().toUpperCase(),
      password,
      customSafeServerUrl: trimmedCustomServer === '' ? undefined : trimmedCustomServer,
    });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      handleSubmit();
    }
  }

  onMount(() => {
    identityInputComponent?.focus();
  });
</script>

<template>
  <Step>
    <header>
      <h1>
        {$i18n.t('dialog--linking-safe-restore.label--title', 'Restore from {shortAppName} Safe', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      </h1>
      <p class="intro">
        {$i18n.t(
          'dialog--linking-safe-restore.prose--intro',
          'Enter your {shortAppName} ID and {shortAppName} Safe password to restore your profile, contacts, and settings.',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        )}
      </p>
    </header>

    <div class="body">
      <Input
        bind:this={identityInputComponent}
        bind:value={identity}
        dir="ltr"
        error={showErrors ? errors.identity : undefined}
        id="safe_identity"
        label={$i18n.t('dialog--linking-safe-restore.label--identity', '{shortAppName} ID', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
        oninput={handleInput}
        onpressenter={handleSubmit}
      />
      <Password
        bind:value={password}
        dir="ltr"
        error={showErrors ? errors.password : undefined}
        label={$i18n.t(
          'dialog--linking-safe-restore.label--password',
          '{shortAppName} Safe password',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
        oninput={handleInput}
        onkeydown={handleKeydown}
      />
      <Input
        bind:value={customSafeServerUrl}
        dir="ltr"
        id="safe_custom_server"
        label={$i18n.t(
          'dialog--linking-safe-restore.label--custom-server',
          'Custom Safe server (optional)',
        )}
        oninput={handleInput}
        onpressenter={handleSubmit}
      />
    </div>

    <footer>
      {#if import.meta.env.URLS.overview !== 'hidden'}
        <a href={import.meta.env.URLS.overview.full} target="_blank" rel="noreferrer noopener">
          {$i18n.t('dialog--common.action--need-help', 'Need help?')}
        </a>
      {/if}
      <Button flavor="filled" onclick={handleSubmit}>
        {$i18n.t('dialog--linking-safe-restore.action--restore', 'Restore')}
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

    a {
      color: var(--t-text-e2-color);
      text-decoration: none;
    }
  }
</style>
