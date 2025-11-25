<script lang="ts">
  import type {AppServicesForSvelte} from '~/app/types';
  import {i18n} from '~/app/ui/i18n';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {unlinkAndCreateBackup} from '~/app/ui/utils/profile';
  import {assertUnreachable} from '~/common/utils/assert';

  interface Props {
    services: AppServicesForSvelte;
  }

  const {services}: Props = $props();

  // Unpack services.
  const {backend} = services;

  let notificationPermission = $state<NotificationPermission>(Notification.permission);

  async function requestNotificationPermissionAndNotify(): Promise<void> {
    notificationPermission = await Notification.requestPermission();
    // eslint-disable-next-line no-new
    new Notification('Test notification');
  }

  /**
   * Unlink and delete the device data and restart the application.
   */
  async function handleClickUnlink(): Promise<void> {
    await unlinkAndCreateBackup(services);
  }
</script>

<section class="storage">
  <h3>Permissions</h3>

  <Button
    flavor="filled"
    onclick={() => {
      requestNotificationPermissionAndNotify().catch(assertUnreachable);
    }}
  >
    <span class="icon-and-text">
      <MdIcon theme="Filled">notifications</MdIcon>
      Notification Permission [{notificationPermission}]
    </span>
  </Button>

  <h3>User Profile</h3>

  <Button flavor="filled" onclick={handleClickUnlink}>
    <span class="icon-and-text">
      <MdIcon theme="Filled">restart_alt</MdIcon>
      {#if import.meta.env.DEBUG}Unlink and Exit{:else}Unlink and Relink{/if}
    </span>
  </Button>
  <p>
    {#if import.meta.env.DEBUG}
      <em> This will unlink the device from your device group and close the application.</em>
    {:else}
      <em>
        This will unlink the device from your device group, delete the profile data on this device
        and restart. (Note that this will not work properly when not started through the launcher
        binary.)
      </em>
    {/if}
  </p>

  <h3>Database</h3>

  <Button
    flavor="filled"
    onclick={() => {
      backend.debug.generateFakeContactConversation().catch(assertUnreachable);
    }}
  >
    <span class="icon-and-text">
      <MdIcon theme="Filled">auto_fix_normal</MdIcon>
      Generate fake contact conversation
    </span>
  </Button>

  <Button
    flavor="filled"
    onclick={() => {
      backend.debug.generateFakeGroupConversation().catch(assertUnreachable);
    }}
  >
    <span class="icon-and-text">
      <MdIcon theme="Filled">auto_fix_normal</MdIcon>
      Generate fake group conversation
    </span>
  </Button>

  <h3>Screenshots</h3>

  <Button
    flavor="filled"
    onclick={() => {
      backend.debug.importScreenshotData($i18n.locale).catch(assertUnreachable);
    }}
  >
    <span class="icon-and-text">
      <MdIcon theme="Filled">auto_fix_normal</MdIcon>
      Import screenshot data
    </span>
  </Button>
</section>

<style lang="scss">
  @use 'component' as *;

  .storage {
    padding: rem(8px);
    display: grid;
    gap: rem(8px);
    place-items: center;
    grid-auto-flow: row;
  }

  .icon-and-text {
    display: flex;
    gap: rem(4px);
    place-items: center;
  }
</style>
