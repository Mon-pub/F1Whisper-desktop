<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import {checkAndCompleteUrl} from '~/app/ui/components/partials/modals/onprem-configuration-modal/helpers';
  import {i18n} from '~/app/ui/i18n';
  import type {LinkingWizardEnterServerProps} from '~/app/ui/linking';
  import Step from '~/app/ui/linking/Step.svelte';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import Password from '~/app/ui/svelte-components/blocks/Input/Password.svelte';
  import {STATIC_CONFIG} from '~/common/config';
  import {assertUnreachable} from '~/common/utils/assert';
  import {base64ToU8a} from '~/common/utils/base64';
  import {UTF8} from '~/common/utils/codec';

  const log = globals.unwrap().uiLogging.logger('ui.component.linking-enter-server');

  const {oppfConfig, services}: LinkingWizardEnterServerProps = $props();

  let hostInputComponent = $state<Input>();

  let host = $state<string>('');
  let activationKey = $state<string>('');
  let submitError: string | undefined = $state(undefined);

  /**
   * Decode an activation key of the form `base64url(username).base64url(password)` into its
   * username and password parts, mirroring the format issued by the server's `issue-key` command.
   *
   * @throws If the key is not two non-empty base64url segments.
   */
  function decodeActivationKey(key: string): {username: string; password: string} {
    const segments = key.trim().split('.');
    if (segments.length !== 2) {
      throw new Error('Activation key must have exactly two segments separated by a dot');
    }
    const [encodedUsername, encodedPassword] = segments;
    if (
      encodedUsername === undefined ||
      encodedUsername === '' ||
      encodedPassword === undefined ||
      encodedPassword === ''
    ) {
      throw new Error('Activation key segments must not be empty');
    }
    function toStandardBase64(value: string): string {
      return value.replaceAll('-', '+').replaceAll('_', '/');
    }
    return {
      username: UTF8.decode(base64ToU8a(toStandardBase64(encodedUsername))),
      password: UTF8.decode(base64ToU8a(toStandardBase64(encodedPassword))),
    };
  }

  async function handleClickConfirm(): Promise<void> {
    let username: string;
    let password: string;
    try {
      ({username, password} = decodeActivationKey(activationKey));
    } catch (error) {
      log.warn('Failed to decode activation key', error);
      submitError = $i18n.t(
        'dialog--linking-server.error--invalid-key',
        'The activation key is invalid. Please check it and try again.',
      );
      return;
    }

    try {
      const url = checkAndCompleteUrl(host);
      const status = await services.electron.checkOppFile(
        url.toString(),
        username,
        password,
        STATIC_CONFIG.USER_AGENT,
      );

      if (status === 200) {
        oppfConfig.resolve({
          oppfUrl: url.toString(),
          username,
          password,
        });
      } else if (status === 401) {
        submitError = $i18n.t(
          'dialog--linking-server.error--credentials-error',
          'The server rejected the activation key. Please check the server address and activation key, or contact your administrator.',
        );
      } else {
        log.warn('OPPF fetch failed with status code', status);
        submitError = $i18n.t(
          'dialog--linking-server.error--fetch-error',
          'The server address is invalid. Please check it or contact your administrator.',
        );
      }
    } catch (error) {
      log.error('OPPF fetch errored', error);
      submitError = $i18n.t(
        'dialog--linking-server.error--fetch-error-connection',
        'The server is not reachable. Please check your network connection or contact your administrator.',
      );
    }
  }

  function handleInput(): void {
    submitError = undefined;
  }

  function handleKeydownEvent(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      void handleClickConfirm().catch(assertUnreachable);
    }
  }

  onMount(() => {
    hostInputComponent?.focus();
  });
</script>

<template>
  <Step>
    <header>
      <h1>
        {$i18n.t('dialog--linking-server.label--title', 'Connect to Your Server')}
      </h1>
      <p class="intro">
        {$i18n.t(
          'dialog--linking-server.prose--intro',
          'Enter the address of your {fullAppName} server and the activation key provided by your administrator.',
          {
            fullAppName: import.meta.env.APP_NAME,
          },
        )}
      </p>
    </header>

    <div class="body">
      <Password
        bind:value={activationKey}
        dir="ltr"
        label={$i18n.t('dialog--linking-server.label--activation-key', 'Activation key')}
        oninput={handleInput}
        onkeydown={handleKeydownEvent}
      />
      <Input
        bind:this={hostInputComponent}
        bind:value={host}
        dir="ltr"
        id="server_host"
        label={$i18n.t('dialog--linking-server.label--host', 'Server address')}
        oninput={handleInput}
        onpressenter={() => {
          void handleClickConfirm().catch(assertUnreachable);
        }}
      />
      {#if submitError !== undefined}
        <div class="error">
          <Text text={submitError} color="inherit" family="secondary" />
        </div>
      {/if}
    </div>

    <footer>
      {#if import.meta.env.URLS.overview !== 'hidden'}
        <a href={import.meta.env.URLS.overview.full} target="_blank" rel="noreferrer noopener">
          {$i18n.t('dialog--common.action--need-help', 'Need help?')}
        </a>
      {/if}
      <Button flavor="filled" onclick={handleClickConfirm}>
        {$i18n.t('dialog--common.action--next', 'Next')}
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

    .error {
      margin-top: rem(4px);
      color: var(--c-input-text-error-color);
    }
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
