<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {LoadingScreenProps} from '~/app/ui/components/partials/loading-screen/props';
  import Logo from '~/app/ui/components/partials/logo/Logo.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import {i18n} from '~/app/ui/i18n';
  import type {LoadingState} from '~/common/dom/backend';
  import type {u53} from '~/common/types';
  import {assertUnreachable, unreachable} from '~/common/utils/assert';
  import {ResolvablePromise} from '~/common/utils/resolvable-promise';
  import {TIMER} from '~/common/utils/timer';

  const {uiLogging} = globals.unwrap();
  const {loadingState}: LoadingScreenProps = $props();

  export const finishedLoading = new ResolvablePromise<void>({uncaught: 'default'});
  export const cancelledLoading = new ResolvablePromise<void>({uncaught: 'default'});
  const log = uiLogging.logger('ui.component.loading-screen');

  let progress = $state<u53 | undefined>(undefined);
  // Whether to paint the branding (animated logo). Previously the logo was gated on `progress`
  // being defined, which only happens during reflection-queue sync — so for the whole backend-init
  // window (KDF unlock, WASM, DB open, connect) the user saw an EMPTY themed container after the
  // index.html splash was torn down. Showing the animated (indeterminate) logo from the moment
  // init starts means there is never a blank window (the Signal-Desktop shell-first pattern).
  let showBranding = $state(false);
  // Whether to show the (actionable) connection-error screen instead of the spinner.
  let connectionError = $state(false);

  function handleCompleteAnimation(): void {
    // Wait for a short time, so that the loading indicator doesn't disappear immediately.
    TIMER.sleep(750)
      .finally(() => {
        finishedLoading.resolve();
      })
      .catch(assertUnreachable);
  }

  function handleUpdateLoadingState(value: LoadingState): void {
    log.debug(`Updating loadingState to ${value.state}`);
    switch (value.state) {
      case 'pending':
      case 'initializing':
        progress = undefined;
        connectionError = false;
        // Paint the indeterminate logo immediately so the init window is never blank.
        showBranding = true;
        break;

      case 'cancelled':
        progress = undefined;
        showBranding = false;
        connectionError = false;
        cancelledLoading.resolve();
        break;

      case 'connection-error':
        // The connection could not be established. Show a meaningful, actionable error instead of
        // spinning forever. The backend keeps retrying in the background, so a later successful
        // connection moves us to 'ready' (and the app is shown).
        progress = undefined;
        showBranding = false;
        connectionError = true;
        break;

      case 'processing-reflection-queue': {
        connectionError = false;
        showBranding = true;
        if (value.reflectionQueueLength === 0) {
          progress = undefined;
          return;
        }
        progress = value.reflectionQueueProcessed / value.reflectionQueueLength;
        break;
      }

      case 'ready':
        connectionError = false;
        showBranding = true;
        if (progress === undefined) {
          // If there was no progress indicator, the loading screen can be closed directly.
          finishedLoading.resolve();
          return;
        }
        // Set `progress` to `1` to trigger the animation, just in case (if it wasn't already).
        progress = 1;
        break;

      default:
        unreachable(value);
    }
  }

  function handleRetry(): void {
    // The connection manager is already retrying in the background; hide the error and show the
    // indeterminate spinner again. A subsequent failure re-pushes 'connection-error', a success
    // pushes 'ready'.
    connectionError = false;
    progress = undefined;
    showBranding = true;
  }

  function handleContinueOffline(): void {
    // Stop blocking on the loading screen and enter the app in a disconnected state. The connection
    // manager keeps retrying in the background and the UI updates once connected.
    connectionError = false;
    showBranding = false;
    cancelledLoading.resolve();
  }

  $effect(() => {
    handleUpdateLoadingState($loadingState);
  });
</script>

<div class="container" data-build-platform={import.meta.env.BUILD_PLATFORM}>
  {#if connectionError}
    <div class="connection-error">
      <Text
        alignment="center"
        color="mono-high"
        size="h3"
        text={$i18n.t('status.prose--connection-error-title', "Can't reach the server")}
      />
      <Text
        alignment="center"
        color="mono-low"
        size="body"
        text={$i18n.t(
          'status.prose--connection-error-body',
          "Couldn't reach the server. Please check your internet connection. We'll keep trying automatically.",
        )}
      />
      <div class="actions">
        <Button flavor="filled" onclick={handleRetry}>
          {$i18n.t('status.action--connection-error-retry', 'Try again')}
        </Button>
        <Button flavor="naked" onclick={handleContinueOffline}>
          {$i18n.t('status.action--connection-error-continue-offline', 'Continue offline')}
        </Button>
      </div>
    </div>
  {:else if showBranding}
    <div class="indicator">
      <!--
        `progress ?? 'unknown'` => an indeterminate (pending) animation during init, a determinate
        bar during reflection-queue sync. `'unknown'` never triggers `oncompletion`, so the app is
        never attached before the backend signals `ready`.
      -->
      <Logo
        animated={true}
        oncompletion={handleCompleteAnimation}
        progress={progress ?? 'unknown'}
      />
    </div>

    {#if progress !== undefined}
      <Text
        alignment="center"
        color="mono-low"
        size="body"
        text={$i18n.t('status.prose--startup-processing-reflection-queue', 'Syncing messages...')}
        wrap={false}
      />
    {/if}
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: rem(10px);

    color: var(--t-text-e1-color);
    background-color: var(--t-main-background-color);
    height: 100vh;

    .indicator {
      width: rem(96px);
      height: rem(121px);
    }

    .connection-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: rem(16px);
      max-width: rem(360px);
      padding: rem(24px);
      text-align: center;

      .actions {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: rem(8px);
        margin-top: rem(8px);
        width: 100%;
      }
    }

    &[data-build-platform='macos'] {
      &::before {
        position: absolute;
        content: '';
        left: 0;
        right: 0;
        top: 0;
        height: rem(64px);

        // Use as drag area for the Electron window.
        -webkit-app-region: drag;
      }
    }
  }
</style>
