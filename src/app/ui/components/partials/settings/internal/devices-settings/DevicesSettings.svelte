<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import EditDeviceNameModal from '~/app/ui/components/partials/settings/internal/devices-settings/internal/edit-device-name-modal/EditDeviceNameModal.svelte';
  import RelinkDeviceModal from '~/app/ui/components/partials/settings/internal/devices-settings/internal/relink-device-modal/RelinkDeviceModal.svelte';
  import type {DevicesSettingsProps} from '~/app/ui/components/partials/settings/internal/devices-settings/props';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import {isDeviceName} from '~/common/network/types';
  import {assertUnreachable} from '~/common/utils/assert';

  const {actions, services, settings}: DevicesSettingsProps = $props();

  const {backend} = services;

  let modalState = $state<'none' | 'edit-device-name' | 'relink-device'>('none');

  function handleClickEditDeviceName(): void {
    modalState = 'edit-device-name';
  }

  function handleCloseModal(): void {
    modalState = 'none';
  }

  function handleNewDeviceName(newDeviceName: string): void {
    if (isDeviceName(newDeviceName)) {
      actions.updateSettings({deviceName: newDeviceName});
    }
    backend.connectionManager.disconnect().catch(assertUnreachable);
    modalState = 'none';
  }
</script>

<KeyValueList>
  <KeyValueList.Section title={$i18n.t('settings--devices.label--this-device', 'This Device')}>
    <KeyValueList.ItemWithButton icon="edit" key="" onclick={handleClickEditDeviceName}>
      <div class="container">
        <div class="icon">
          <MdIcon theme="Outlined">computer</MdIcon>
        </div>

        <div class="content">
          <Text text={settings.deviceName} />
        </div>
      </div>
    </KeyValueList.ItemWithButton>

    <KeyValueList.ItemWithButton
      icon="restart_alt"
      key=""
      onclick={() => (modalState = 'relink-device')}
    >
      <Text text={$i18n.t('settings--devices.label--relink', 'Relink this device')}></Text>
    </KeyValueList.ItemWithButton>
  </KeyValueList.Section>
</KeyValueList>

{#if modalState === 'none'}
  <!-- No modal is displayed in this state. -->
{:else if modalState === 'edit-device-name'}
  <EditDeviceNameModal
    onclose={handleCloseModal}
    onnewdevicename={handleNewDeviceName}
    value={settings.deviceName}
  />
{:else if modalState === 'relink-device'}
  <RelinkDeviceModal onclose={handleCloseModal} {services} />
{:else}
  {svelteUnreachable(modalState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    @extend %neutral-input;
    display: flex;
    flex-direction: row;
    justify-content: stretch;
    align-items: center;

    .icon {
      display: flex;
      place-items: center;
      font-size: rem(24px);
      line-height: rem(24px);
      color: var(--t-text-e2-color);
      padding: rem(8px);
      gap: rem(12px);
    }

    .content {
      display: flex;
      flex-direction: column;
      align-items: start;
      justify-content: start;
    }
  }
</style>
