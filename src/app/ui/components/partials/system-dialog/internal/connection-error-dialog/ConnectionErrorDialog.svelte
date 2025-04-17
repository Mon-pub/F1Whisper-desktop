<!--
  @component Renders a system dialog to inform the user about a connection error.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import SubstitutableText from '~/app/ui/SubstitutableText.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {ModalButton} from '~/app/ui/components/hocs/modal/props';
  import type {ConnectionErrorDialogProps} from '~/app/ui/components/partials/system-dialog/internal/connection-error-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import {unlinkAndCreateBackup} from '~/app/ui/utils/profile';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {unreachable} from '~/common/utils/assert';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.connection-error-dialog');

  const {error, onclose, onselectaction, services, target}: ConnectionErrorDialogProps = $props();

  const downloadAndInfoUrl = import.meta.env.URLS.downloadAndInfo;
  const limitationsUrl = import.meta.env.URLS.limitations;

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function getButtons(currentError: typeof error): ModalButton[] {
    switch (currentError) {
      case 'client-update-required':
        return [
          {
            isFocused: true,
            label: $i18n.t('dialog--common.action--ignore', 'Ignore'),
            onclick: () => {
              onselectaction?.('dismissed');
              modalComponent?.close();
            },
            type: 'filled',
          },
        ];

      case 'client-was-dropped':
      case 'device-slot-state-mismatch':
        return [
          {
            label: $i18n.t('dialog--common.action--ignore', 'Ignore'),
            onclick: () => {
              onselectaction?.('dismissed');
              modalComponent?.close();
            },
            type: 'naked',
          },
          {
            isFocused: true,
            label: $i18n.t('dialog--common.action--relink', 'Relink Device'),
            onclick: () => {
              if (!services.isSet()) {
                log.warn('Cannot unlink the profile because the app services are not yet ready');
                return;
              }
              unlinkAndCreateBackup(services.unwrap()).catch(log.error);
            },
            type: 'filled',
          },
        ];

      case 'mediator-update-required':
        return [
          {
            label: $i18n.t('dialog--common.action--ignore', 'Ignore'),
            onclick: () => {
              onselectaction?.('dismissed');
              modalComponent?.close();
            },
            type: 'naked',
          },
          {
            isFocused: true,
            label: $i18n.t('dialog--error-connection.action--confirm-reconnect', 'Reconnect'),
            onclick: () => {
              onselectaction?.('confirmed');
              modalComponent?.close();
            },
            type: 'filled',
          },
        ];

      default:
        return unreachable(currentError);
    }
  }
</script>

<Modal
  bind:this={modalComponent}
  {onclose}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: false,
    overlay: 'opaque',
    suspendHotkeysWhenVisible: true,
  }}
  {target}
  wrapper={{
    type: 'card',
    buttons: getButtons(error),
    title: $i18n.t('dialog--error-connection.label--title', 'Connection Failed'),
    minWidth: 340,
    maxWidth: 460,
  }}
>
  <div class="content">
    {#if error === 'mediator-update-required'}
      <p>
        {$i18n.t(
          'dialog--error-connection.prose--mediator-update-required-p1',
          'This version of {shortAppName} is not compatible with your mediator server. The server uses an outdated protocol version and must be updated first.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      </p>
      <p>
        {$i18n.t(
          'dialog--error-connection.prose--mediator-update-required-p2',
          'Please contact your {shortAppName} server administrator.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      </p>
    {:else if error === 'client-update-required'}
      <p>
        {$i18n.t(
          'dialog--error-connection.markup--client-update-required-p1',
          'This version of {shortAppName} is no longer supported (outdated protocol version).',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      </p>
      {#if import.meta.env.BUILD_VARIANT !== 'custom' && downloadAndInfoUrl !== 'hidden'}
        <p>
          <SubstitutableText
            text={$i18n.t(
              'dialog--error-connection.markup--client-update-required-p2',
              'To continue using {shortAppName}, please <slot_1>update to the latest version</slot_1>.',
              {
                shortAppName: import.meta.env.SHORT_APP_NAME,
              },
            )}
          >
            {#snippet slot_1(text)}
              <a href={downloadAndInfoUrl.full} target="_blank" rel="noreferrer noopener">{text}</a>
            {/snippet}
          </SubstitutableText>
        </p>
      {/if}
    {:else if error === 'client-was-dropped'}
      <p>
        {$i18n.t(
          'dialog--error-connection.markup--client-was-dropped-p1',
          'This device has been unlinked. This means that you cannot currently send or receive new messages.',
        )}
      </p>
      <p>
        {$i18n.t(
          'dialog--error-connection.markup--client-was-dropped-p2',
          'If this was not triggered by you, please note that this might happen for technical reasons during the Beta phase. We apologize for the inconvience.',
        )}
      </p>

      <p>
        {$i18n.t(
          'dialog--error-connection.markup--backup',
          'The message history will be restored after relinking.',
        )}
      </p>
      {#if import.meta.env.BUILD_VARIANT !== 'custom' && limitationsUrl !== 'hidden'}
        <p>
          <SubstitutableText
            text={$i18n.t(
              'dialog--error-connection.markup--see-faq',
              'For more information, see the <slot_1>FAQ</slot_1>.',
            )}
          >
            {#snippet slot_1(text)}
              <a href={limitationsUrl.full} target="_blank" rel="noreferrer noopener">{text}</a>
            {/snippet}
          </SubstitutableText>
        </p>
      {/if}
    {:else if error === 'device-slot-state-mismatch'}
      <p>
        {$i18n.t(
          'dialog--error-connection.markup--device-slot-mismatch-p1',
          'Due to an unexpected error, this device must be re-linked with the server.',
        )}
      </p>
      {#if import.meta.env.BUILD_VARIANT !== 'custom' && limitationsUrl !== 'hidden'}
        <p>
          <SubstitutableText
            text={$i18n.t(
              'dialog--error-connection.markup--see-faq',
              'For more information, see the <slot_1>FAQ</slot_1>.',
            )}
          >
            {#snippet slot_1(text)}
              <a href={limitationsUrl.full} target="_blank" rel="noreferrer noopener">{text}</a>
            {/snippet}
          </SubstitutableText>
        </p>
      {/if}
    {:else}
      {unreachable(error)}
    {/if}
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px);

    p:first-child {
      margin-top: 0;
    }

    p:last-child {
      margin-bottom: 0;
    }
  }
</style>
