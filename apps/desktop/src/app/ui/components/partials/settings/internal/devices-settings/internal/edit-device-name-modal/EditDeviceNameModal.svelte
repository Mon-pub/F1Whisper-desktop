<script lang="ts">
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {EditDeviceNameModalProps} from '~/app/ui/components/partials/settings/internal/devices-settings/internal/edit-device-name-modal/props';
  import {i18n} from '~/app/ui/i18n';

  let {
    maxlength = 128,
    onclose,
    onnewdevicename,
    value = $bindable(),
  }: EditDeviceNameModalProps = $props();

  function isValidDeviceName(deviceName: string): boolean {
    return deviceName !== '';
  }

  function handleClickConfirm(): void {
    if (!isValidDeviceName(value)) {
      return;
    }

    onnewdevicename?.(value);
  }
</script>

<Modal
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    buttons: [
      {
        label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
        type: 'naked',
        onclick: 'close',
      },
      {
        label: $i18n.t('dialog--common.action--confirm', 'Confirm'),
        type: 'filled',
        onclick: handleClickConfirm,
      },
    ],
    title: $i18n.t('dialog--edit-device-name.action--title', 'Edit Device Name'),
    minWidth: 280,
    maxWidth: 460,
  }}
  options={{
    allowClosingWithEsc: true,
    allowSubmittingWithEnter: true,
  }}
  {onclose}
  onsubmit={handleClickConfirm}
>
  <div class="content">
    <Input
      bind:value
      autofocus
      id="device-name"
      {maxlength}
      error={isValidDeviceName(value)
        ? undefined
        : $i18n.t(
            'dialog--edit-device-name.error--device-name-empty',
            'Device name must not be empty',
          )}
      onpressenter={handleClickConfirm}
    />
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    padding: 0 rem(16px);
  }
</style>
