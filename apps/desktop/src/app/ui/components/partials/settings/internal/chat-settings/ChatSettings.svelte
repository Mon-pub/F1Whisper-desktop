<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import type {ChatSettingsProps} from '~/app/ui/components/partials/settings/internal/chat-settings/props';
  import {i18n} from '~/app/ui/i18n';
  import type {SystemInfo} from '~/common/electron-ipc';
  import {ComposeBarEnterMode} from '~/common/enum';

  const log = globals.unwrap().uiLogging.logger('ui.component.chat-settings');

  const {actions, services, settings}: ChatSettingsProps = $props();

  let systemInfo = $state<SystemInfo | undefined>(undefined);

  services.electron
    .getSystemInfo()
    .then((systemInfo_) => (systemInfo = systemInfo_))
    .catch((error) => {
      log.error('Could not fetch system info', error);
    });

  const onEnterSubmit = $derived(settings.onEnterSubmit);

  let onEnterSubmitToggleState = $derived(onEnterSubmit);
</script>

<KeyValueList>
  <KeyValueList.Section title={$i18n.t('settings--chat.label--keyboard', 'Keyboard')}>
    <!-- eslint-disable svelte/no-reactive-reassign -->
    <KeyValueList.ItemWithSwitch
      bind:checked={onEnterSubmitToggleState}
      key={$i18n.t('settings--chat.label--on-enter-send', 'Enter to Send')}
      onswitch={() =>
        actions.updateSettings({
          composeBarEnterMode: !onEnterSubmit
            ? ComposeBarEnterMode.SUBMIT
            : ComposeBarEnterMode.LINE_BREAK,
        })}
    >
      <!-- eslint-enable svelte/no-reactive-reassign -->
      <Text
        text={onEnterSubmit
          ? $i18n.t(
              'settings--chat.label--on-enter-submit',
              'Enter key sends the message. Use Shift + Enter to add a new line.',
            )
          : $i18n.t(
              'settings--chat.label--on-enter-new-line',
              'Enter key adds a new line. Use {keyCombination} to send the message.',
              {
                keyCombination: systemInfo?.os === 'macos' ? '⌘ + Enter' : 'Ctrl + Enter',
              },
            )}
      />
    </KeyValueList.ItemWithSwitch>
  </KeyValueList.Section>
</KeyValueList>
