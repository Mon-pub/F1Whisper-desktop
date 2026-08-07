<!--
  @component Renders a settings page for security settings.
-->
<script lang="ts">
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import SafeBackupModal from '~/app/ui/components/partials/settings/internal/security-settings/internal/safe-backup-modal/SafeBackupModal.svelte';
  import type {SecuritySettingsProps} from '~/app/ui/components/partials/settings/internal/security-settings/props';
  import {i18n} from '~/app/ui/i18n';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';

  const {services}: SecuritySettingsProps = $props();

  const {router} = services;

  let modalState = $state<'none' | 'safe-backup'>('none');

  function handleClickChangePassword(): void {
    router.go({modal: ROUTE_DEFINITIONS.modal.changePassword.withoutParams()});
  }

  function handleClickSafeBackup(): void {
    modalState = 'safe-backup';
  }

  function handleCloseModal(): void {
    modalState = 'none';
  }
</script>

<KeyValueList>
  <KeyValueList.Section
    title={$i18n.t('settings--security.label--app-protection', 'App Protection')}
  >
    <KeyValueList.ItemWithButton icon="edit" key="" onclick={handleClickChangePassword}>
      <Text text={$i18n.t('settings--security.label--change-password', 'Change App Password')} />
    </KeyValueList.ItemWithButton>
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
