<!--
  @component
  Desktop-native picker for the per-conversation disappearing-messages timer (F1Whisper fork). Shows
  a card modal with a vertical list of presets (Off / 30s / 5m / 1h / 8h / 1d / 1w / 4w); the current
  timer is pre-selected. Selecting a preset invokes `onselect(timerSeconds)` (0 = off) and closes.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {DisappearingMessagesModalProps} from '~/app/ui/components/partials/conversation/internal/disappearing-messages-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import type {I18nType} from '~/app/ui/i18n-types';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import MenuContainer from '~/app/ui/svelte-components/generic/Menu/MenuContainer.svelte';
  import MenuItem from '~/app/ui/svelte-components/generic/Menu/MenuItem.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {u53} from '~/common/types';

  const {currentTimerSeconds = 0, onselect, onclose}: DisappearingMessagesModalProps = $props();

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  // Presets in seconds. `0` means "off". Order matches the Android fork.
  const SECONDS_PER_MINUTE = 60;
  const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
  const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
  const SECONDS_PER_WEEK = 7 * SECONDS_PER_DAY;

  function getPresets(t: I18nType['t']): {label: string; value: u53}[] {
    return [
      {label: t('dialog--disappearing-messages.label--preset-off', 'Off'), value: 0},
      {
        label: t('dialog--disappearing-messages.label--preset-30-seconds', '30 seconds'),
        value: 30,
      },
      {
        label: t('dialog--disappearing-messages.label--preset-5-minutes', '5 minutes'),
        value: 5 * SECONDS_PER_MINUTE,
      },
      {
        label: t('dialog--disappearing-messages.label--preset-1-hour', '1 hour'),
        value: SECONDS_PER_HOUR,
      },
      {
        label: t('dialog--disappearing-messages.label--preset-8-hours', '8 hours'),
        value: 8 * SECONDS_PER_HOUR,
      },
      {
        label: t('dialog--disappearing-messages.label--preset-1-day', '1 day'),
        value: SECONDS_PER_DAY,
      },
      {
        label: t('dialog--disappearing-messages.label--preset-1-week', '1 week'),
        value: SECONDS_PER_WEEK,
      },
      {
        label: t('dialog--disappearing-messages.label--preset-4-weeks', '4 weeks'),
        value: 4 * SECONDS_PER_WEEK,
      },
    ];
  }

  const presets = $derived(getPresets($i18n.t));

  function handleSelect(value: u53): void {
    // Only emit a change if the selection actually differs from the current timer.
    if (value !== currentTimerSeconds) {
      onselect?.(value);
    }
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
    title: $i18n.t('dialog--disappearing-messages.label--title', 'Disappearing messages'),
    minWidth: 300,
    maxWidth: 440,
  }}
  options={{
    allowClosingWithEsc: true,
  }}
  {onclose}
>
  <div class="content">
    <div class="description">
      <Text
        color="mono-low"
        size="body-small"
        text={$i18n.t(
          'dialog--disappearing-messages.prose--description',
          'New messages in this chat will disappear for everyone after the selected duration.',
        )}
        wrap
      />
    </div>
    <MenuContainer mode="large">
      {#each presets as preset (preset.value)}
        {@const selected = preset.value === currentTimerSeconds}
        <MenuItem {selected} onclick={() => handleSelect(preset.value)}>
          {#snippet snippetIcon()}
            <span class="check" class:visible={selected}>
              <MdIcon theme="Filled">check</MdIcon>
            </span>
          {/snippet}
          <span class="label">{preset.label}</span>
        </MenuItem>
      {/each}
    </MenuContainer>
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    gap: rem(8px);

    .description {
      padding: 0 rem(16px);
    }

    .check {
      display: inline-flex;
      align-items: center;
      color: var(--t-color-primary);
      visibility: hidden;

      &.visible {
        visibility: visible;
      }
    }

    .label {
      display: inline-flex;
      align-items: center;
    }
  }
</style>
