<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import {
    getModalButtons,
    deleteForEveryoneSupported,
  } from '~/app/ui/components/partials/conversation/internal/delete-message-modal/helpers';
  import type {DeleteMessageModalProps} from '~/app/ui/components/partials/conversation/internal/delete-message-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {unreachable} from '~/common/utils/assert';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.delete-message-modal');

  const {
    featureSupport,
    isNotesGroup,
    message,
    onclickdeleteforeveryone,
    onclickdeletelocally,
    onclose,
    showDeleteForEveryoneButton = true,
  }: DeleteMessageModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  function handleClickDeleteLocally(): void {
    onclickdeletelocally?.(message);
    modalComponent?.close();
  }

  function handleClickDeleteForEveryone(): void {
    switch (message.type) {
      case 'deleted-message':
        log.warn('Cannot delete a message that was already deleted');
        break;

      case 'regular-message':
        onclickdeleteforeveryone?.(message);
        break;

      case 'status-message':
        log.warn('Cannot delete a status message for everyone, as they are local-only');
        break;

      default:
        unreachable(message);
    }

    modalComponent?.close();
  }

  const buttons = $derived(
    getModalButtons({
      message,
      isFeatureSupported:
        featureSupport.supported &&
        showDeleteForEveryoneButton &&
        message.type === 'regular-message' &&
        message.pollData === undefined,
      isNotesGroup,
      handleClickDeleteLocally,
      handleClickDeleteForEveryone,
      i18n: $i18n,
    }),
  );
</script>

<Modal
  bind:this={modalComponent}
  {onclose}
  options={{
    allowClosingWithEsc: true,
    allowSubmittingWithEnter: false,
  }}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    buttons,
    layout: 'compact',
    maxWidth: 640,
    minWidth: 320,
    title: $i18n.t('dialog--delete-message.label--title', 'Delete message'),
  }}
>
  <div class="content">
    <div class="description">
      <p>
        <Text
          text={$i18n.t(
            'dialog--delete-message.prose--delete-message',
            'Do you really want to delete this message?',
          )}
        />
      </p>
      {#if showDeleteForEveryoneButton && deleteForEveryoneSupported( {message, isFeatureSupported: featureSupport.supported, isNotesGroup}, ) && featureSupport.supported && featureSupport.notSupportedNames.length > 0}
        <p>
          <Text
            text={$i18n.t(
              'dialog--delete-message.prose--delete-not-supported-partial',
              'Note: If you select "{buttonText}", this message will not be deleted for the following group members: {names}{n, plural, =0 {.} other { and {n} others.}} To support deleted messages, they need to install the latest {shortAppName} version.',
              {
                buttonText: $i18n.t('dialog--delete-message.action--delete-for-everyone'),
                n: `${featureSupport.notSupportedNames.length > 5 ? featureSupport.notSupportedNames.length - 5 : 0}`,
                names: featureSupport.notSupportedNames.slice(0, 5).join(', '),
                shortAppName: import.meta.env.SHORT_APP_NAME,
              },
            )}
          />
        </p>
      {/if}
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    .description {
      padding: 0 rem(16px);

      p:first-child {
        margin-top: 0;
      }
    }
  }
</style>
