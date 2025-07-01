<!--
  @component Renders a system dialog with a screen sharing picker.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import ScreenSharingPickerThumbnail from '~/app/ui/components/partials/system-dialog/internal/screen-sharing-picker-dialog/internal/ScreenSharingPickerThumbnail.svelte';
  import type {ScreenSharingPickerDialogProps} from '~/app/ui/components/partials/system-dialog/internal/screen-sharing-picker-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {sources, onclose, onselect, ondismiss, target}: ScreenSharingPickerDialogProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  const screens = sources.filter((source) => source.isScreen);
  const windows = sources.filter((source) => !source.isScreen);
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
    buttons: [
      {
        isFocused: true,
        label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
        onclick: () => {
          ondismiss();
          modalComponent?.close();
        },
        type: 'filled',
      },
    ],
    layout: 'compact',
    minWidth: 0,
    title: $i18n.t('messaging.label--call-screen-sharing-picker-title', 'Select What to Share'),
  }}
>
  <div class="content">
    <Text
      text={$i18n.t('messaging.label--call-screen-sharing-picker-title-screens', 'Entire Screen')}
    ></Text>
    <div class="thumbnails">
      {#each screens as screen (screen.id)}
        <ScreenSharingPickerThumbnail
          source={screen}
          onselect={(id) => {
            onselect(id);
            modalComponent?.close();
          }}
        ></ScreenSharingPickerThumbnail>
      {/each}
    </div>

    <hr />

    <Text
      text={$i18n.t(
        'messaging.label--call-screen-sharing-picker-title-windows',
        'Application Window',
      )}
    ></Text>
    <div class="thumbnails">
      {#each windows as window (window.id)}
        <ScreenSharingPickerThumbnail
          source={window}
          onselect={(id) => {
            onselect(id);
            modalComponent?.close();
          }}
        ></ScreenSharingPickerThumbnail>
      {/each}
    </div>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    gap: rem(8px);

    width: fit-content;
    padding: rem(8px) rem(16px) rem(32px) rem(16px);

    hr {
      border: none;
      border-top: solid rem(1px) var(--c-menu-item-divider-color, default);
      margin: rem(8px) 0;
    }

    .thumbnails {
      display: grid;
      grid-template-columns: repeat(1, min-content);
      gap: rem(16px);
    }
  }

  @container modal-wrapper (min-width: 580px) {
    .content {
      gap: rem(16px);

      .thumbnails {
        grid-template-columns: repeat(2, min-content);
      }
    }
  }

  @container modal-wrapper (min-width: 840px) {
    .content {
      gap: rem(16px);

      .thumbnails {
        grid-template-columns: repeat(3, min-content);
      }
    }
  }
</style>
