<script lang="ts">
  import SubstitutableText from '~/app/ui/SubstitutableText.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {KeyStorageMigrationFailedModalProps} from '~/app/ui/components/partials/modals/key-storage-migration-failed-modal/props';
  import {i18n} from '~/app/ui/i18n';

  const {services}: KeyStorageMigrationFailedModalProps = $props();

  export const foreverPromise: Promise<never> = new Promise<never>(() => {});

  function closeApp(): void {
    services.electron.closeApp();
  }
</script>

<Modal
  wrapper={{
    type: 'card',
    title: $i18n.t('dialog--key-storage-migration-failed.label--title', 'Backend Migration Failed'),
    maxWidth: 460,
    buttons: [
      {
        isFocused: false,
        label: $i18n.t('dialog--common.action--close-app', 'Close App'),
        onclick: closeApp,
        type: 'filled',
      },
    ],
  }}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: false,
  }}
>
  <div class="content">
    <p>
      {#if import.meta.env.URLS.support !== 'hidden'}
        <SubstitutableText
          text={$i18n.t(
            'dialog--key-storage-migration-failed.prose--description-consumer',
            'A migration in the backend failed unexpectedly. Please contact our <slot_1>support team</slot_1> and send a log file if possible.',
          )}
        >
          {#snippet slot_1(text)}
            <a href="https://threema.com/support-request" target="_blank" rel="noreferrer noopener">
              {text}
            </a>
          {/snippet}
        </SubstitutableText>
      {:else}
        <Text
          text={$i18n.t(
            'dialog--key-storage-migration-failed.prose--description-work',
            'A migration in the backend failed unexpectedly. Please contact your adminstrator.',
          )}
        ></Text>
      {/if}
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
