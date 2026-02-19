<!--
  @component Renders a system dialog to recover from invalid certificate pins
-->
<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import PartyPopper from '~/app/res/icon/emoji-party-popper.svg?raw';
  import SubstitutableText from '~/app/ui/SubstitutableText.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import Logo from '~/app/ui/components/partials/logo/Logo.svelte';
  import type {InvalidCertificatePinsDialogProps} from '~/app/ui/components/partials/system-dialog/internal/invalid-certificate-pins-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {KeyStorageError} from '~/common/key-storage';
  import type {u53} from '~/common/types';
  import {assertUnreachable} from '~/common/utils/assert';
  import {ResolvablePromise} from '~/common/utils/resolvable-promise';
  import {TIMER} from '~/common/utils/timer';

  const {
    recoveryHandle,
    requestedPassword,
    previouslyAttemptedPassword,
    backendCreationError,
  }: InvalidCertificatePinsDialogProps = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.invalid-certificate-pins');

  type ModalState = 'passwordInput' | 'recovering' | 'success' | 'error';

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);
  let passwordInputComponent = $state<SvelteNullableBinding<Password>>(null);
  let modalState = $state<ModalState>('recovering');
  let password = $state<string>(requestedPassword);
  let hasError = $state<boolean>(previouslyAttemptedPassword !== undefined);
  let errorMessage = $state<string | undefined>(undefined);
  let keyStorageError = $state<KeyStorageError | undefined>(undefined);
  let progress = $state<u53 | undefined | 'unknown'>(undefined);
  export const finishedLoading = new ResolvablePromise<void>({uncaught: 'default'});
  export const completionPromise = new ResolvablePromise<boolean>({uncaught: 'default'});

  function clearError(): void {
    hasError = false;
  }

  function handleCompleteAnimation(): void {
    // Wait for a short time, so that the loading indicator doesn't disappear immediately.
    TIMER.sleep(750)
      .finally(() => {
        finishedLoading.resolve();
      })
      .catch(assertUnreachable);
  }

  onMount(async () => {
    if (modalState === 'recovering') {
      await handleClickConfirm();
    }
  });

  async function handleClickConfirm(): Promise<void> {
    if (!recoveryHandle.isSet()) {
      log.error('Recovery handle not set');
      errorMessage = 'Recovery service not available';
      modalState = 'error';
      progress = undefined;
      return;
    }

    try {
      hasError = false;
      modalState = 'recovering';
      progress = 'unknown';

      const handle = recoveryHandle.unwrap();
      const {isRemoteSecretActive} = await handle.recoverCertificatePins(password);

      progress = 1;
      await finishedLoading;
      modalState = 'success';

      // Wait for a short time for the user to be able to see the success screen
      // before signaling restart readiness.
      TIMER.sleep(3000)
        .finally(() => {
          completionPromise.resolve(isRemoteSecretActive);
        })
        .catch(assertUnreachable);
    } catch (error) {
      keyStorageError = error instanceof KeyStorageError ? error : undefined;
      errorMessage = error instanceof Error ? `${error.message}` : String(error);
      progress = undefined;

      // Check if it's a wrong password error
      if (keyStorageError?.type === 'undecryptable') {
        hasError = true;
        modalState = 'passwordInput';
      } else {
        modalState = 'error';
      }
    }
  }
</script>

<Modal
  bind:this={modalComponent}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: modalState === 'passwordInput',
    overlay: 'opaque',
  }}
  wrapper={{
    type: 'card',
    title:
      // eslint-disable-next-line no-nested-ternary
      modalState === 'passwordInput'
        ? $i18n.t(
            'dialog--invalid-credentials-dialog.label--title',
            'Unable To Connect With OnPrem Server',
          )
        : // eslint-disable-next-line no-nested-ternary
          modalState === 'success'
          ? $i18n.t(
              'dialog--invalid-credentials-dialog.label--title-success',
              'Successfully Updated OnPrem Connection Settings',
            )
          : // eslint-disable-next-line no-nested-ternary
            modalState === 'recovering'
            ? $i18n.t(
                'dialog--invalid-credentials-dialog.label--title-recovering',
                'Processing Fallback OnPrem Connection Settings',
              )
            : modalState === 'error'
              ? $i18n.t(
                  'dialog--invalid-credentials-dialog.label--title-error',
                  'Unable To Update OnPrem Connection Settings',
                )
              : undefined,
    maxWidth: 500,
    buttons:
      // eslint-disable-next-line no-nested-ternary
      modalState === 'passwordInput'
        ? [
            {
              isFocused: true,
              label: $i18n.t('dialog--common.action--continue'),
              onclick: handleClickConfirm,
              type: 'filled',
            },
          ]
        : modalState === 'error'
          ? [
              {
                isFocused: true,
                label: $i18n.t('dialog--common.action--retry'),
                onclick: handleClickConfirm,
                type: 'filled',
              },
            ]
          : [],
  }}
>
  {#if modalState === 'passwordInput'}
    <div class="content">
      <div class="description">
        <SubstitutableText
          text={$i18n.t(
            'dialog--invalid-credentials-dialog.prose--description',
            "We're having trouble connecting to your company server. To fix this, we'll update your connection and restart the app.",
          )}
        />
      </div>

      <Password
        bind:this={passwordInputComponent}
        bind:value={password}
        error={hasError
          ? $i18n.t(
              'dialog--invalid-credentials-dialog.error--incorrect-password',
              'The entered password is incorrect. Please try again.',
            )
          : undefined}
        label={$i18n.t('dialog--invalid-credentials-dialog.label--password', 'App Password')}
        oninput={clearError}
        onkeydown={async (event) => {
          if (event.key === 'Enter') {
            await handleClickConfirm();
          }
        }}
      />
      <div class="hint">
        {$i18n.t(
          'dialog--invalid-credentials-dialog.prose--hint',
          'We need your password to apply the updated settings.',
        )}
      </div>
    </div>
  {:else if modalState === 'recovering'}
    <div class="body">
      <div class="loading-indicator">
        <Logo animated={true} oncompletion={handleCompleteAnimation} {progress} />
      </div>
      <div class="description">
        <SubstitutableText
          text={$i18n.t(
            'dialog--invalid-credentials-dialog.prose--description-recovering',
            "We're updating your connection settings. This will only take a moment.",
          )}
        />
      </div>
    </div>
  {:else if modalState === 'success'}
    <div class="body">
      <div class="party">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html PartyPopper}
      </div>
      <div class="description">
        <SubstitutableText
          text={$i18n.t(
            'dialog--invalid-credentials-dialog.prose--description-success',
            'Your connection has been restored. The app will restart automatically.',
          )}
        />
      </div>
    </div>
  {:else if modalState === 'error'}
    <div class="content">
      <div class="description">
        <SubstitutableText
          text={$i18n.t(
            'dialog--invalid-credentials-dialog.prose--description-error',
            "We couldn't restore the connection. Please contact your administrator for help.",
          )}
        />
      </div>
      <div class="technical-details">
        <input type="checkbox" id="drawer-toggle" />
        <label class="drawer-toggle" for="drawer-toggle">
          <span>
            {$i18n.t(
              'dialog--invalid-credentials-dialog.label--technical-details',
              'Technical details (click to expand)',
            )}
          </span>
          <MdIcon
            theme="Filled"
            title={$i18n.t(
              'dialog--invalid-credentials-dialog.hint--expand-full-error-message',
              'Show full error',
            )}
          >
            expand_more
          </MdIcon>
        </label>
        <p class="drawer-content">
          {#if backendCreationError !== undefined}
            Cause: {backendCreationError.type}: {backendCreationError.message}
            <br /><br />
          {/if}
          {errorMessage}
        </p>
      </div>
    </div>
  {/if}
</Modal>

<style lang="scss">
  @use 'component' as *;

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
      'description'
      '.' rem(40px)
      'button';
    justify-items: center;
    padding: rem(28px) 0;

    .loading-indicator {
      margin: rem(24px) auto;
      width: rem(72px);
      height: rem(72px);
    }

    .party {
      grid-area: party;
      height: rem(74px);
      line-height: rem(74px);
      font-size: rem(56px);

      :global(svg) {
        color: var(--t-color-primary);
      }
    }

    .description {
      grid-area: description;
      @extend %font-large-400;
      text-align: center;
    }
  }

  .content {
    padding: 0 rem(12px) rem(12px);

    .description {
      padding-bottom: rem(24px);
    }

    .hint {
      padding-top: rem(24px);
    }

    .technical-details {
      color: var(--t-text-e2-color);
      text-align: left;
      max-width: 100%;
      user-select: text;
      overflow: hidden;
      border-radius: rem(8px);
      background-color: var(--cc-linking-wizard-error-message-background);

      input {
        position: absolute;
        opacity: 0;
        z-index: -1;
      }

      .drawer-toggle,
      .drawer-content {
        padding: 0 rem(24px);
      }

      .drawer-toggle {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        font-size: rem(18px);
        height: rem(48px);
        cursor: pointer;
        border-radius: rem(8px);

        span {
          font-size: rem(16px);
        }

        :global(.icon) {
          transform: rotate(0);
          transition: transform 0.15s ease-in-out;
        }
      }

      .drawer-content {
        user-select: all;
        max-height: 0;
        overflow-y: scroll;
        transition: all 0.15s ease-in-out;
        font-family: monospace;
      }

      input:checked {
        ~ .drawer-toggle {
          :global(.icon) {
            transform: rotate(180deg);
          }
        }

        ~ .drawer-content {
          max-height: rem(360px);
          padding: rem(8px) rem(24px) rem(18px) rem(24px);
        }
      }

      input:focus-visible {
        ~ .drawer-toggle {
          box-shadow: inset 0 0 0 rem(1px) white;
        }
      }
    }
  }
</style>
