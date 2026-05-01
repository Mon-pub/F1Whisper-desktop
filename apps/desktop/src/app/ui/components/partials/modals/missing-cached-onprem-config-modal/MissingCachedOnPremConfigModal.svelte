<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {MissingCachedOnPremConfigModalProps} from '~/app/ui/components/partials/modals/missing-cached-onprem-config-modal/props';
  import {i18n} from '~/app/ui/i18n';

  const {services}: MissingCachedOnPremConfigModalProps = $props();

  export const foreverPromise: Promise<never> = new Promise<never>(() => {});

  function deleteAndRelink(): void {
    services.electron.deleteProfileAndRestartApp({createBackup: false});
  }
</script>

<Modal
  wrapper={{
    type: 'card',
    title: $i18n.t('dialog--missing-cached-onprem-config.label--title', 'Migration Required'),
    maxWidth: 460,
    buttons: [
      {
        isFocused: false,
        label: $i18n.t('dialog--common.action--relink', 'Relink Device'),
        onclick: deleteAndRelink,
        type: 'filled',
      },
    ],
  }}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: true,
  }}
>
  <div class="content">
    <p>
      <Text
        text={$i18n.t(
          'dialog--missing-cached-onprem-config.prose--description',
          'An app data migration is required but is incompatible with DualLock. This device must be relinked, and local app data will be deleted (data on your other devices is not affected).',
        )}
      />
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
