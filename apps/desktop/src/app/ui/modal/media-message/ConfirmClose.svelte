<script lang="ts">
  import {i18n} from '~/app/ui/i18n';
  import ModalWrapper from '~/app/ui/modal/ModalWrapper.svelte';
  import CancelAndConfirm from '~/app/ui/svelte-components/blocks/ModalDialog/Footer/CancelAndConfirm.svelte';
  import Title from '~/app/ui/svelte-components/blocks/ModalDialog/Header/Title.svelte';
  import ModalDialog from '~/app/ui/svelte-components/blocks/ModalDialog/ModalDialog.svelte';

  interface Props {
    readonly onconfirm?: () => void;
    readonly visible: boolean;
  }

  let {onconfirm, visible = $bindable()}: Props = $props();
</script>

<template>
  <ModalWrapper {visible}>
    <ModalDialog
      bind:visible
      {onconfirm}
      onclose={() => (visible = false)}
      oncancel={() => (visible = false)}
    >
      {#snippet snippetHeader()}
        <Title
          title={$i18n.t('dialog--discard-media-message.label--title', 'Discard Message Draft')}
        />
      {/snippet}
      {#snippet snippetBody()}
        <div class="body">
          {$i18n.t(
            'dialog--discard-media-message.prose--prompt',
            'Discard current media message draft?',
          )}
        </div>
      {/snippet}
      {#snippet snippetFooter(modal)}
        <CancelAndConfirm
          cancelText={$i18n.t('dialog--common.action--cancel', 'Cancel')}
          confirmText={$i18n.t('dialog--discard-media-message.action--confirm', 'Discard')}
          focusOnMount="confirm"
          {modal}
        />
      {/snippet}
    </ModalDialog>
  </ModalWrapper>
</template>

<style lang="scss">
  @use 'component' as *;

  .body {
    @extend %font-normal-400;
    padding: rem(16px);
  }
</style>
