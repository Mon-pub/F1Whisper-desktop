<script lang="ts">
  import {onMount} from 'svelte';

  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardCreateNewIdProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {onCreateNewId, onRestoreFromSafe}: LinkingWizardCreateNewIdProps = $props();

  let createButtonComponent = $state<SvelteNullableBinding<Button>>(null);

  onMount(() => {
    createButtonComponent?.focus();
  });
</script>

<template>
  <Step scrollable={false}>
    <header>
      <h1>
        {$i18n.t('dialog--linking-create-id.label--title', 'Set Up {shortAppName}', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      </h1>
      <p class="intro">
        {$i18n.t(
          'dialog--linking-create-id.prose--intro',
          'Create a new {shortAppName} ID on this computer, or restore an existing one from a {shortAppName} Safe backup.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      </p>
    </header>

    <div class="body">
      <Button bind:this={createButtonComponent} flavor="filled" onclick={onCreateNewId}>
        {$i18n.t('dialog--linking-create-id.action--create', 'Create a New {shortAppName} ID', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      </Button>
      <Button flavor="naked" onclick={onRestoreFromSafe}>
        {$i18n.t('dialog--linking-create-id.action--restore', 'Restore from {shortAppName} Safe', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      </Button>
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

  header {
    display: grid;
    gap: rem(8px);
    margin-bottom: rem(32px);

    h1 {
      @extend %font-large-400;
      margin-bottom: rem(8px);
    }

    .intro {
      color: var(--t-text-e2-color);
    }
  }

  .body {
    display: grid;
    gap: rem(12px);
    justify-items: stretch;
  }
</style>
