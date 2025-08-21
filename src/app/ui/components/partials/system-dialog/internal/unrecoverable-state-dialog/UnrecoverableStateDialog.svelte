<!--
  @component Renders a system dialog to inform the user that the app transitioned into an
  unrecoverable state.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {UnrecoverableStateDialogProps} from '~/app/ui/components/partials/system-dialog/internal/unrecoverable-state-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import {unlinkAndCreateBackup} from '~/app/ui/utils/profile';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.unrecoverable-state-dialog');

  const {onclose, onselectaction, services}: UnrecoverableStateDialogProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);
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
  wrapper={{
    type: 'card',
    buttons: [
      {
        label: $i18n.t('dialog--common.action--ignore', 'Ignore'),
        onclick: () => {
          onselectaction?.({type: 'dismissed'});
          modalComponent?.close();
        },
        type: 'naked',
      },
      {
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
    ],
    title: $i18n.t('dialog--unrecoverable-state.label--title', 'Unrecoverable State Detected'),
    minWidth: 340,
    maxWidth: 460,
  }}
>
  <div class="content">
    <p>
      {$i18n.t(
        'dialog--unrecoverable-state.prose--description-p1',
        'We have detected that your local data is in an unrecoverable state. To prevent data loss, you currently can’t send or receive new messages. We apologize for the inconvenience.',
      )}
    </p>
    <p>
      {$i18n.t(
        'dialog--unrecoverable-state.prose--description-p2',
        'To continue using {shortAppName}, you need to relink the device. The message history can be restored after relinking.',
        {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        },
      )}
    </p>
    <p>
      {$i18n.t(
        'dialog--unrecoverable-state.prose--description-p3',
        'Please report this error to {shortAppName}’s support from the app on your mobile device (“Settings > Beta Feedback”). Note: Remember to save your logs before relinking, as they will be cleared.',
        {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        },
      )}
    </p>
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
