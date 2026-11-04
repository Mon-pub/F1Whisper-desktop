<!--
  @component Renders a settings page for security settings.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import SafeBackupModal from '~/app/ui/components/partials/settings/internal/security-settings/internal/safe-backup-modal/SafeBackupModal.svelte';
  import type {SecuritySettingsProps} from '~/app/ui/components/partials/settings/internal/security-settings/props';
  import {i18n} from '~/app/ui/i18n';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import {createScreenshotPreventionState} from '~/common/utils/settings';

  const {services, actions}: SecuritySettingsProps = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.security-settings');

  const {router} = services;

  let modalState = $state<'none' | 'safe-backup'>('none');

  const workSettingsViewStore = $derived(services.settings.views.work);
  const privacySettingsViewStore = $derived(services.settings.views.privacy);

  const screenshotPreventionState = $derived(
    createScreenshotPreventionState($workSettingsViewStore, $privacySettingsViewStore, log),
  );

  const screenshotPreventionLabel = $derived(
    screenshotPreventionState.enabled
      ? $i18n.t(
          'settings--security.label--prevent-screenshots-enabled',
          'Taking screenshots is disabled',
        )
      : $i18n.t(
          'settings--security.label--prevent-screenshots-disabled',
          'Taking screenshots is enabled',
        ),
  );

  const hintText = $derived(
    screenshotPreventionState.mode === 'mdm'
      ? $i18n.t(
          'settings--security.hint--prevent-screenshots-mdm',
          'This setting is managed by your organization.',
        )
      : $i18n.t(
          'settings--security.hint--prevent-screenshots-unsupported',
          'This setting is not supported on your system.',
        ),
  );

  function handleClickChangePassword(): void {
    router.go({modal: ROUTE_DEFINITIONS.modal.changePassword.withoutParams()});
  }

  function handleClickSafeBackup(): void {
    modalState = 'safe-backup';
  }

  function handleCloseModal(): void {
    modalState = 'none';
  }

  function handleScreenshotPreventionUpdate(enabled: boolean): void {
    actions.updateSettings({localScreenshotPrevention: enabled});
  }
</script>

{#snippet screenshotPreventionSwitch()}
  <KeyValueList.ItemWithSwitch
    key={$i18n.t('settings--security.label--prevent-screenshots', 'No screenshots')}
    disabled={screenshotPreventionState.mode !== 'changeable'}
    checked={screenshotPreventionState.enabled}
    hint={screenshotPreventionState.mode === 'changeable' ? undefined : hintText}
    onswitch={(state) => handleScreenshotPreventionUpdate(state.new)}
  >
    <Text text={screenshotPreventionLabel}></Text>
  </KeyValueList.ItemWithSwitch>
{/snippet}

<KeyValueList>
  <KeyValueList.Section
    title={$i18n.t('settings--security.label--app-protection', 'App Protection')}
  >
    <KeyValueList.ItemWithButton icon="edit" key="" onclick={handleClickChangePassword}>
      <Text text={$i18n.t('settings--security.label--change-password', 'Change App Password')} />
    </KeyValueList.ItemWithButton>
    {@render screenshotPreventionSwitch()}
  </KeyValueList.Section>

  <KeyValueList.Section title={$i18n.t('settings--security.label--backup-section', 'Backup')}>
    <KeyValueList.ItemWithButton icon="chevron_right" key="" onclick={handleClickSafeBackup}>
      <Text
        text={$i18n.t('settings--security.label--safe-backup', '{shortAppName} Safe Backup', {
          shortAppName: import.meta.env.SHORT_APP_NAME,
        })}
      />
    </KeyValueList.ItemWithButton>
  </KeyValueList.Section>
</KeyValueList>

{#if modalState === 'none'}
  <!-- No modal is displayed in this state. -->
{:else if modalState === 'safe-backup'}
  <SafeBackupModal onclose={handleCloseModal} {services} />
{:else}
  {svelteUnreachable(modalState)}
{/if}
