<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import {i18n} from '~/app/ui/i18n';
  import type {RestorationIdentityMismatchProps} from '~/app/ui/linking';

  const {accept, onclose}: RestorationIdentityMismatchProps = $props();

  async function handleContinue(): Promise<void> {
    return await new Promise<void>((resolve) => {
      accept.resolve();
    });
  }
</script>

<Modal
  {onclose}
  options={{
    allowClosingWithEsc: false,
    allowSubmittingWithEnter: false,
  }}
  wrapper={{
    type: 'card',
    buttons: [
      {
        label: $i18n.t('dialog--common.action--retry', 'Retry'),
        type: 'naked',
        onclick: () => window.location.reload(),
      },
      {
        label: $i18n.t(
          'dialog--linking-restoration-identity-mismatch.label--continue',
          'Link Without Chat History',
        ),
        type: 'filled',
        onclick: handleContinue,
      },
    ],
    title: $i18n.t(
      'dialog--linking-restoration-identity-mismatch.label--title',
      'Restore Messages',
    ),
    maxWidth: 460,
  }}
>
  <div class="content">
    <div class="description">
      <Text
        text={$i18n.t(
          'dialog--linking-restoration-identity-mismatch.prose--intro',
          'A different {shortAppName} ID was previously used on this device. Your chat history cannot be restored.',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      />
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    .description {
      padding: 0 rem(16px);
    }
  }
</style>
