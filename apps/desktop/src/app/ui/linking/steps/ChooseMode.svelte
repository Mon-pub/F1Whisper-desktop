<script lang="ts">
  import {onMount} from 'svelte';

  import {ensureLocale, i18n, LOCALES, LOCALE_NAMES, type Locale} from '~/app/ui/i18n';
  import type {LinkingWizardChooseModeProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {onSelectStandalone, onSelectLink, localeStore}: LinkingWizardChooseModeProps = $props();

  // Locales offered by the picker. 'cimode' is an i18next debug pseudo-locale, never a real
  // language choice.
  const selectableLocales = LOCALES.filter((locale) => locale !== 'cimode');

  let selectedLocale = $state<Locale>(ensureLocale(localeStore?.get()));

  function handleLocaleChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    selectedLocale = ensureLocale(value);
    localeStore?.set(selectedLocale);
  }

  let standaloneButton = $state<HTMLButtonElement | null>(null);

  onMount(() => {
    standaloneButton?.focus();
  });
</script>

<template>
  <Step scrollable={false}>
    {#if localeStore !== undefined}
      <div class="language">
        <MdIcon theme="Outlined">language</MdIcon>
        <select
          aria-label={$i18n.t('settings--appearance.label--locale', 'Language')}
          value={selectedLocale}
          onchange={handleLocaleChange}
        >
          {#each selectableLocales as locale (locale)}
            <option value={locale}>{LOCALE_NAMES[locale]}</option>
          {/each}
        </select>
      </div>
    {/if}

    <header>
      <h1>
        {$i18n.t('dialog--linking-choose-mode.label--title', 'Welcome to {shortAppName}', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      </h1>
      <p class="intro">
        {$i18n.t(
          'dialog--linking-choose-mode.prose--intro',
          'Choose how you want to use {shortAppName} on this computer.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      </p>
    </header>

    <div class="body">
      <button bind:this={standaloneButton} class="option" onclick={onSelectStandalone}>
        <span class="badge">
          <MdIcon theme="Outlined">computer</MdIcon>
        </span>
        <span class="text">
          <span class="title">
            {$i18n.t('dialog--linking-choose-mode.action--standalone', 'Use as a Standalone App')}
          </span>
          <span class="hint">
            {$i18n.t(
              'dialog--linking-choose-mode.prose--standalone-hint',
              'Create a new {shortAppName} ID for this computer, or restore one from a Safe backup. No phone needed.',
              {
                shortAppName: import.meta.env.SHORT_APP_NAME,
              },
            )}
          </span>
        </span>
        <span class="chevron">
          <MdIcon theme="Outlined">chevron_right</MdIcon>
        </span>
      </button>

      <button class="option" onclick={onSelectLink}>
        <span class="badge">
          <MdIcon theme="Outlined">smartphone</MdIcon>
        </span>
        <span class="text">
          <span class="title">
            {$i18n.t('dialog--linking-choose-mode.action--link', 'Link with Your Phone')}
          </span>
          <span class="hint">
            {$i18n.t(
              'dialog--linking-choose-mode.prose--link-hint',
              'Use the {shortAppName} ID from your phone. Your chats stay in sync on both devices.',
              {
                shortAppName: import.meta.env.SHORT_APP_NAME,
              },
            )}
          </span>
        </span>
        <span class="chevron">
          <MdIcon theme="Outlined">chevron_right</MdIcon>
        </span>
      </button>
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

  .language {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: rem(6px);
    margin-bottom: rem(16px);
    color: var(--t-text-e2-color);

    select {
      @extend %font-small-400;
      appearance: auto;
      background-color: transparent;
      color: var(--t-text-e1-color);
      border: rem(1px) solid var(--t-panel-gap-color);
      border-radius: rem(8px);
      padding: rem(4px) rem(8px);
      cursor: pointer;

      &:hover,
      &:focus-visible {
        border-color: var(--t-color-primary);
      }
    }
  }

  header {
    display: grid;
    gap: rem(8px);
    margin-bottom: rem(24px);

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

    .option {
      display: flex;
      align-items: center;
      gap: rem(16px);
      padding: rem(16px);
      text-align: start;
      background-color: transparent;
      color: inherit;
      font: inherit;
      border: rem(1px) solid var(--t-panel-gap-color);
      border-radius: rem(12px);
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease;

      &:hover,
      &:focus-visible {
        border-color: var(--t-color-primary);
        background-color: var(--t-nav-background-color);
      }

      .badge {
        display: grid;
        place-items: center;
        flex: none;
        width: rem(48px);
        height: rem(48px);
        border-radius: 50%;
        background-color: var(--t-nav-background-color);
        color: var(--t-color-primary);
        font-size: rem(24px);
      }

      .text {
        display: grid;
        gap: rem(4px);
        min-width: 0;

        .title {
          @extend %font-large-400;
          color: var(--t-text-e1-color);
        }

        .hint {
          @extend %font-small-400;
          color: var(--t-text-e2-color);
        }
      }

      .chevron {
        display: grid;
        place-items: center;
        flex: none;
        margin-inline-start: auto;
        color: var(--t-text-e2-color);
        font-size: rem(24px);
      }
    }
  }

  :global([dir='rtl']) .body .option .chevron {
    transform: scaleX(-1);
  }
</style>
