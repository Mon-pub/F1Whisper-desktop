<script lang="ts">
  import {onMount} from 'svelte';

  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardSetDisplayNameProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {displayName}: LinkingWizardSetDisplayNameProps = $props();

  /** Maximum length of the display name (nickname) accepted by this step. */
  const MAX_DISPLAY_NAME_LENGTH = 32;

  let nameComponent = $state<SvelteNullableBinding<Input>>(null);
  let name = $state<string>('');

  function handleSubmit(): void {
    const trimmed = name.trim();
    displayName.resolve(trimmed === '' ? undefined : trimmed);
  }

  function handleSkip(): void {
    displayName.resolve(undefined);
  }

  onMount(() => {
    nameComponent?.focus();
  });
</script>

<template>
  <Step scrollable={false}>
    <header>
      <h1>{$i18n.t('dialog--linking-set-display-name.label--title', 'Your name')}</h1>
      <p class="intro">
        {$i18n.t(
          'dialog--linking-set-display-name.prose--intro',
          'Choose the name shown to your contacts. You can change it later in the settings.',
        )}
      </p>
    </header>

    <div class="body">
      <Input
        bind:this={nameComponent}
        bind:value={name}
        id="set_display_name"
        label={$i18n.t('dialog--linking-set-display-name.label--name', 'Your name')}
        maxlength={MAX_DISPLAY_NAME_LENGTH}
        onpressenter={handleSubmit}
      />
    </div>

    <footer>
      <Button flavor="naked" onclick={handleSkip}>
        {$i18n.t('dialog--linking-set-display-name.action--skip', 'Skip')}
      </Button>
      <Button flavor="filled" onclick={handleSubmit}>
        {$i18n.t('dialog--linking-set-display-name.action--next', 'Next')}
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
