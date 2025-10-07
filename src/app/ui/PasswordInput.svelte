<script lang="ts">
  import {onMount} from 'svelte';

  import type {AppServicesForSvelte} from '~/app/types';
  import Hint from '~/app/ui/components/atoms/hint/Hint.svelte';
  import Switch from '~/app/ui/components/atoms/switch/Switch.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import ForgotPasswordModal from '~/app/ui/components/partials/modals/forgot-password-modal/ForgotPasswordModal.svelte';
  import {i18n} from '~/app/ui/i18n';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import Title from '~/app/ui/svelte-components/blocks/ModalDialog/Header/Title.svelte';
  import ModalDialog from '~/app/ui/svelte-components/blocks/ModalDialog/ModalDialog.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {SystemInfo} from '~/common/electron-ipc';
  import {unreachable} from '~/common/utils/assert';
  import {ResolvablePromise} from '~/common/utils/resolvable-promise';

  interface Props {
    /**
     * The previously attempted password. If provided, a 'wrong password' error message will be
     * shown.
     */
    readonly previouslyAttemptedPassword: string | undefined;
    readonly services: Pick<AppServicesForSvelte, 'electron'>;
    readonly shouldStorePassword: ResolvablePromise<boolean>;
    readonly systemInfo: SystemInfo;
  }

  const {previouslyAttemptedPassword, services, shouldStorePassword, systemInfo}: Props = $props();

  /**
   * A promise that can be awaited. It will resolve once the password been entered by the user.
   */
  export const passwordPromise = new ResolvablePromise<string>({uncaught: 'default'});

  const minPasswordLength = 1;

  let modalState = $state<'none' | 'forgot-password'>('none');
  let hasError = $state<boolean>(previouslyAttemptedPassword !== undefined);
  let isSubmitted = $state<boolean>(false);
  let password = $state<string>(previouslyAttemptedPassword ?? '');
  let shouldStorePasswordValue = $state<boolean>(false);

  let passwordInputComponent = $state<SvelteNullableBinding<Password>>(null);

  function handleOnSubmit(): void {
    if (password.length >= minPasswordLength) {
      isSubmitted = true;
      shouldStorePassword.resolve(shouldStorePasswordValue);
      passwordPromise.resolve(password);
    }
  }

  function handleClickForgotPassword(): void {
    modalState = 'forgot-password';
  }

  function handleCloseForgotPasswordModal(): void {
    hasError = false;
    modalState = 'none';
  }

  function handleClickSwitch(event: Event): void {
    event.preventDefault();

    if (!systemInfo.isSafeStorageAvailable) {
      return;
    }

    shouldStorePasswordValue = !shouldStorePasswordValue;
  }

  function clearError(): void {
    hasError = false;
  }

  onMount(() => {
    passwordInputComponent?.focusAndSelect();
  });
</script>

<div class="wrapper">
  <ModalDialog
    closableWithEscape={false}
    onconfirm={handleOnSubmit}
    scrollable={false}
    visible={true}
  >
    {#snippet snippetHeader()}
      <Title title={$i18n.t('dialog--startup-unlock.label--title', 'Enter App Password')} />
    {/snippet}
    {#snippet snippetBody()}
      <div class="body" data-has-error={hasError}>
        <Password
          bind:this={passwordInputComponent}
          bind:value={password}
          error={hasError
            ? $i18n.t(
                'dialog--startup-unlock.error--incorrect-password',
                'The entered password is incorrect. Please try again.',
              )
            : undefined}
          label={$i18n.t('dialog--startup-unlock.label--password', 'App Password')}
          oninput={clearError}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              handleOnSubmit();
            }
          }}
        />
        <div class="save">
          <Hint
            id="password-input-safe-storage-info-tooltip"
            icon="info"
            text={systemInfo.isSafeStorageAvailable
              ? $i18n.t(
                  'dialog--startup-unlock.prose--save-password-tooltip',
                  "Your password is stored using your system's default secure credential storage.",
                )
              : $i18n.t(
                  'dialog--startup-unlock.prose--save-password-tooltip-unavailable',
                  '{shortAppName} for Desktop could not detect a default secure credential storage on your device.',
                  {
                    shortAppName: import.meta.env.SHORT_APP_NAME,
                  },
                )}
          />
          <label for="savePassword">
            {$i18n.t('dialog--startup-unlock.label--save-password', 'Save securely on device')}
          </label>
          <Switch
            role="switch"
            disabled={!systemInfo.isSafeStorageAvailable}
            bind:checked={shouldStorePasswordValue}
            onclick={handleClickSwitch}
            onkeydown={(event: KeyboardEvent) => {
              if (event.key === ' ') {
                handleClickSwitch(event);
              }
            }}
          />
        </div>
      </div>
    {/snippet}
    {#snippet snippetFooter()}
      <div class="footer">
        <Button
          disabled={password.length < minPasswordLength || isSubmitted || hasError}
          flavor="filled"
          isLoading={isSubmitted}
          onclick={handleOnSubmit}
        >
          {$i18n.t('dialog--common.action--continue', 'Continue')}
        </Button>
        <span class="hint">
          <button type="button" onclick={handleClickForgotPassword}>
            <Text
              verticalAlign="baseline"
              text={$i18n.t('dialog--startup-unlock.markup--password-hint', 'Forgot password?')}
            />
          </button>
        </span>
      </div>
    {/snippet}
  </ModalDialog>
</div>

{#if modalState === 'none'}
  <!-- No modal to display. -->
{:else if modalState === 'forgot-password'}
  <ForgotPasswordModal onclose={handleCloseForgotPasswordModal} {services} />
{:else}
  {unreachable(modalState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .wrapper {
    height: 100vh;
    display: grid;
    grid-template: 'app' min-content;
    place-content: center;
    color: var(--t-text-e1-color);
    background-color: var(--t-pairing-background-color);
  }

  .body {
    width: rem(480px);
    max-width: 100%;
    padding: rem(16px) rem(16px) rem(16px) rem(16px);

    .save {
      display: flex;
      flex-direction: row-reverse;
      gap: rem(8px);
      margin-top: rem(16px);
      color: var(--t-text-e2-color);
    }
  }

  .footer {
    padding: rem(16px);
    display: grid;

    .hint {
      display: flex;
      align-items: center;
      justify-content: center;

      button {
        @extend %neutral-input;
        @include clicktarget-link-rect;

        & {
          border: solid em(1px) transparent;
          cursor: pointer;
          color: var(--t-text-e2-color);
          margin-top: rem(8px);
          text-decoration: underline;
        }
      }
    }
  }
</style>
