<!--
  @component Renders a system dialog to inform the user about a new app update.
-->
<script lang="ts">
  import SubstitutableText from '~/app/ui/SubstitutableText.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {ManualAppUpdateDialogProps} from '~/app/ui/components/partials/system-dialog/internal/manual-app-update-dialog/props';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {
    currentVersion,
    latestVersion,
    onclose,
    onselectaction,
    systemInfo,
  }: ManualAppUpdateDialogProps = $props();

  const downloadAndInfoUrl = import.meta.env.URLS.downloadAndInfo;

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
        isFocused: true,
        label: $i18n.t('dialog--common.action--ok', 'OK'),
        onclick: () => {
          onselectaction?.('dismissed');
          modalComponent?.close();
        },
        type: 'filled',
      },
    ],
    title: $i18n.t(
      'dialog--manual-app-update.label--title',
      'Update available: {current} → {latest}',
      {
        current: currentVersion,
        latest: latestVersion,
      },
    ),
    minWidth: 340,
    maxWidth: 460,
  }}
>
  <div class="content">
    <p>
      {$i18n.t(
        'dialog--manual-app-update.prose--intro',
        'An update for {shortAppName} is available!',
        {shortAppName: import.meta.env.SHORT_APP_NAME},
      )}
    </p>
    {#if systemInfo.os === 'linux' && downloadAndInfoUrl !== 'hidden'}
      <p>
        <SubstitutableText
          text={$i18n.t(
            'dialog--manual-app-update.markup--linux-p1',
            'Please install the update through your system package manager or by running <slot_1>flatpak update</slot_1> in your terminal.',
          )}
        >
          {#snippet slot_1(text)}
            <code>{text}</code>
          {/snippet}
        </SubstitutableText>
      </p>
      <p>
        <SubstitutableText
          text={$i18n.t(
            'dialog--manual-app-update.markup--linux-p2',
            'For more information about this update, see <slot_1 />.',
          )}
        >
          {#snippet slot_1()}
            <a href={downloadAndInfoUrl.full} target="_blank" rel="noreferrer noopener"
              >{downloadAndInfoUrl.short}</a
            >
          {/snippet}
        </SubstitutableText>
      </p>
    {:else if systemInfo.os === 'macos' && downloadAndInfoUrl !== 'hidden'}
      <p>
        <SubstitutableText
          text={$i18n.t(
            'dialog--manual-app-update.markup--macos-p1',
            'Please update by downloading and installing the latest release from <slot_1 />.',
          )}
        >
          {#snippet slot_1()}
            <a href={downloadAndInfoUrl.full} target="_blank" rel="noreferrer noopener"
              >{downloadAndInfoUrl.short}</a
            >
          {/snippet}
        </SubstitutableText>
      </p>
    {:else if systemInfo.os === 'windows' && downloadAndInfoUrl !== 'hidden'}
      <p>
        <SubstitutableText
          text={$i18n.t(
            'dialog--manual-app-update.markup--windows-p1',
            'Please update by downloading and installing the latest release from <slot_1 />.',
          )}
        >
          {#snippet slot_1()}
            <a href={downloadAndInfoUrl.full} target="_blank" rel="noreferrer noopener"
              >{downloadAndInfoUrl.short}</a
            >
          {/snippet}
        </SubstitutableText>
      </p>
    {:else}
      <p>
        <SubstitutableText
          text={$i18n.t('dialog--manual-app-update.markup--other-os-p1', 'Please update {name}.', {
            name: import.meta.env.APP_NAME,
          })}
        />
      </p>
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
