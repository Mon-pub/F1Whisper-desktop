<!--
  @component Renders a modal that lets the user edit their own nickname (display name).
-->
<script lang="ts">
  import Input from '~/app/ui/components/atoms/input/Input.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {EditNicknameModalProps} from '~/app/ui/components/partials/modals/edit-nickname-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {MAX_NICKNAME_BYTES} from '~/app/ui/utils/constants';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {UTF8} from '~/common/utils/codec';
  import {TIMER} from '~/common/utils/timer';

  const {currentNickname, onclose, onsave}: EditNicknameModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  let nicknameInputValue = $state(currentNickname);
  let nicknameByteSize = $state(UTF8.encode(currentNickname.trim()).byteLength);

  const handleMutation = TIMER.debounce(
    () => (nicknameByteSize = UTF8.encode(nicknameInputValue.trim()).byteLength),
    200,
    true,
  );

  function handleSubmit(): void {
    const trimmed = nicknameInputValue.trim();

    // Reject nicknames that are too long.
    if (UTF8.encode(trimmed).byteLength > MAX_NICKNAME_BYTES) {
      nicknameByteSize = UTF8.encode(trimmed).byteLength;
      return;
    }

    onsave(trimmed);
    modalComponent?.close();
  }
</script>

<Modal
  bind:this={modalComponent}
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
        label: $i18n.t('dialog--common.action--save', 'Save'),
        onclick: 'submit',
        type: 'filled',
        disabled: nicknameByteSize > MAX_NICKNAME_BYTES,
      },
    ],
    title: $i18n.t('settings--profile.label--edit-nickname-title', 'Edit Nickname'),
    maxWidth: 460,
  }}
  options={{
    allowSubmittingWithEnter: true,
  }}
  onsubmit={handleSubmit}
  {onclose}
>
  <div class="content">
    <Input
      bind:value={nicknameInputValue}
      oninput={handleMutation}
      autofocus
      id="nickname"
      label={$i18n.t('settings--profile.label--nickname-input', 'Nickname')}
    />
    <div class="hint">
      {$i18n.t(
        'settings--profile.prose--edit-nickname-hint',
        'Leave empty to show your {shortAppName} ID instead.',
        {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        },
      )}
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

    padding: 0 rem(16px);

    .hint {
      @extend %font-small-400;

      color: var(--t-text-e2-color);
    }
  }
</style>
