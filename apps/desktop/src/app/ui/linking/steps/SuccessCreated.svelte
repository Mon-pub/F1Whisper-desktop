<script lang="ts">
  import {onMount} from 'svelte';

  import PartyPopper from '~/app/res/icon/emoji-party-popper.svg?raw';
  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardSuccessCreatedProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {mode, identityReady, safeBackupResult, createdIdentity}: LinkingWizardSuccessCreatedProps =
    $props();

  let buttonComponent = $state<SvelteNullableBinding<Button>>(null);

  const title = $derived(
    mode === 'safe-restore'
      ? $i18n.t(
          'dialog--linking-create-success.label--title-restored',
          'Your {shortAppName} ID Was Restored',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        )
      : $i18n.t(
          'dialog--linking-create-success.label--title-created',
          'Your {shortAppName} ID Is Ready',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        ),
  );

  const description = $derived(
    mode === 'safe-restore'
      ? $i18n.t(
          'dialog--linking-create-success.prose--description-restored',
          'Your {shortAppName} ID has been restored. You can start messaging right away.',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        )
      : $i18n.t(
          'dialog--linking-create-success.prose--description-created',
          '{shortAppName} is now set up on this computer. You can start messaging right away.',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        ),
  );

  const safeBackupMessage = $derived(
    safeBackupResult === 'failed'
      ? $i18n.t(
          'dialog--linking-create-success.prose--safe-backup-failed',
          "Backup didn't complete. You can retry from Settings later.",
        )
      : $i18n.t(
          'dialog--linking-create-success.prose--safe-backup-success',
          'Backed up to {shortAppName} Safe.',
          {shortAppName: import.meta.env.SHORT_APP_NAME},
        ),
  );

  onMount(() => {
    buttonComponent?.focus();
  });
</script>

<template>
  <Step>
    <div class="body">
      <div class="party">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html PartyPopper}
      </div>
      <h1 class="title">{title}</h1>
      {#if createdIdentity !== undefined}
        <div class="identity">
          <span class="identity-label">
            {$i18n.t('dialog--linking-create-success.label--your-id', 'Your {shortAppName} ID', {
              shortAppName: import.meta.env.SHORT_APP_NAME,
            })}
          </span>
          <span class="identity-value" dir="ltr">{createdIdentity}</span>
          <span class="identity-hint">
            {$i18n.t(
              'dialog--linking-create-success.prose--your-id-hint',
              'Only you know this ID — share it with friends to chat.',
            )}
          </span>
        </div>
      {/if}
      <div class="description">
        <p>{description}</p>
        {#if safeBackupResult !== undefined}
          <p class="backup-note" class:failed={safeBackupResult === 'failed'}>
            {safeBackupMessage}
          </p>
        {/if}
      </div>
      <div class="button">
        <Button bind:this={buttonComponent} flavor="filled" onclick={() => identityReady.resolve()}>
          {$i18n.t('dialog--linking-create-success.action--confirm', 'Start Using {shortAppName}', {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          })}
        </Button>
      </div>
    </div>
  </Step>
</template>

<style lang="scss">
  @use 'component' as *;

  h1,
  p {
    padding: 0;
    margin: 0;
  }

  .body {
    display: grid;
    grid-template:
      'party'
      '.' rem(16px)
      'title'
      '.' rem(16px)
      'identity'
      '.' rem(16px)
      'description'
      '.' rem(40px)
      'button';
    justify-items: center;
    padding: rem(28px) 0;

    .party {
      grid-area: party;
      height: rem(74px);
      line-height: rem(74px);
      font-size: rem(56px);

      :global(svg) {
        color: var(--t-color-primary);
      }
    }

    .title {
      grid-area: title;
      @extend %font-h5-400;
    }

    .identity {
      grid-area: identity;
      display: grid;
      gap: rem(6px);
      justify-items: center;
      text-align: center;
      padding: rem(12px) rem(20px);
      border-radius: rem(8px);
      background-color: var(--t-main-background-color, transparent);
      border: rem(1px) solid var(--t-color-primary);

      .identity-label {
        @extend %font-small-400;
        text-transform: uppercase;
        letter-spacing: rem(1px);
        color: var(--t-text-e2-color);
      }

      .identity-value {
        @extend %font-h4-400;
        font-family: monospace;
        letter-spacing: rem(3px);
        color: var(--t-color-primary);
      }

      .identity-hint {
        @extend %font-small-400;
        color: var(--t-text-e2-color);
      }
    }

    .description {
      grid-area: description;
      @extend %font-large-400;
      display: grid;
      gap: rem(12px);
      text-align: center;

      .backup-note {
        @extend %font-normal-400;
        color: var(--t-text-e2-color);

        &.failed {
          color: var(--c-input-text-error-color);
        }
      }
    }

    .button {
      grid-area: button;
    }
  }
</style>
