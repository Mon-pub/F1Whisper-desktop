<!--
  @component Renders a settings page for user profile settings.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {ContextMenuItem} from '~/app/ui/components/hocs/context-menu-provider/types';
  import KeyValueList from '~/app/ui/components/molecules/key-value-list';
  import ProfilePictureModal from '~/app/ui/components/partials/modals/profile-picture-modal/ProfilePictureModal.svelte';
  import {createDropdownItems} from '~/app/ui/components/partials/settings/helpers';
  import {
    getProfilePictureShareWithDropdown,
    getProfilePictureShareWithDropdownLabel,
  } from '~/app/ui/components/partials/settings/internal/profile-settings/helpers';
  import DeleteProfileModal from '~/app/ui/components/partials/settings/internal/profile-settings/internal/delete-profile-modal/DeleteProfileModal.svelte';
  import ProfileInfo from '~/app/ui/components/partials/settings/internal/profile-settings/internal/profile-info/ProfileInfo.svelte';
  import PublicKeyModal from '~/app/ui/components/partials/settings/internal/profile-settings/internal/public-key-modal/PublicKeyModal.svelte';
  import type {ProfileSettingsProps} from '~/app/ui/components/partials/settings/internal/profile-settings/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {reactive} from '~/app/ui/utils/svelte';
  import type {ProfilePictureShareWith} from '~/common/model/settings/profile';
  import type {ProfileSettingsView} from '~/common/model/types/settings';
  import type {IdentityString} from '~/common/network/types';
  import {unreachable} from '~/common/utils/assert';
  import type {Remote} from '~/common/utils/endpoint';
  import type {ProfileViewModelStore} from '~/common/viewmodel/profile';

  const log = globals.unwrap().uiLogging.logger('ui.component.profile-settings');

  const {actions, services, settings}: ProfileSettingsProps = $props();

  const {
    backend: {viewModel},
  } = services;

  let profileViewModelStore = $state<Remote<ProfileViewModelStore> | undefined>(undefined);

  let modalState = $state<'none' | 'profile-picture' | 'public-key' | 'delete-profile'>('none');
  let profilePictureShareWithItems = $state<ContextMenuItem[]>([]);

  viewModel
    .profile()
    .then((loadedProfile) => {
      profileViewModelStore = loadedProfile;
    })
    .catch((error: unknown) => {
      log.error('Loading profile view model failed', error);
    });

  function handleClickProfilePicture(): void {
    modalState = 'profile-picture';
  }

  function handleClickPublicKeyItem(): void {
    modalState = 'public-key';
  }

  function handleCloseModal(): void {
    modalState = 'none';
  }

  function handleClickCopyThreemaId(): void {
    if ($profileViewModelStore?.identity === undefined) {
      return;
    }

    navigator.clipboard
      .writeText($profileViewModelStore.identity)
      .catch(() => log.error('Failed to copy Threema ID to clipboard'));

    toast.addSimpleSuccess(
      $i18n.t('settings--profile.prose--copy-id-content', '{shortAppName} ID copied to clipboard', {
        shortAppName: import.meta.env.SHORT_APP_NAME,
      }),
    );
  }

  function handleChangeProfileSettings(): void {
    const currentAllowList: readonly IdentityString[] =
      settings.profilePictureShareWith.group === 'allowList'
        ? settings.profilePictureShareWith.allowList
        : [];

    const dropdown = getProfilePictureShareWithDropdown($i18n, currentAllowList);
    profilePictureShareWithItems = createDropdownItems<
      ProfileSettingsView,
      ProfilePictureShareWith
    >(dropdown, (profilePictureShareWith) => {
      actions.updateSettings({profilePictureShareWith});
    });
  }

  $effect(() => {
    reactive(handleChangeProfileSettings, [settings, $i18n]);
  });
</script>

{#if $profileViewModelStore !== undefined}
  <div class="profile">
    <KeyValueList>
      <KeyValueList.Section
        title={$i18n.t(
          'settings--profile.prose--main-section-title',
          'Nickname, Avatar & {shortAppName} ID',
          {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          },
        )}
      >
        <KeyValueList.Item key="">
          <ProfileInfo
            color={$profileViewModelStore.profilePicture.color}
            displayName={$profileViewModelStore.displayName}
            initials={$profileViewModelStore.initials}
            onclickprofilepicture={handleClickProfilePicture}
            pictureBytes={$profileViewModelStore.profilePicture.picture}
          />
        </KeyValueList.Item>

        {#if import.meta.env.BUILD_FLAVOR === 'work-onprem'}
          <KeyValueList.Item
            key={$i18n.t('settings.label--threema-onprem-username', '{fullAppName} Username', {
              fullAppName: import.meta.env.APP_NAME,
            })}
          >
            <Text text={$profileViewModelStore.workUsername ?? '-'} selectable={true} />
          </KeyValueList.Item>
        {:else if import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'}
          <KeyValueList.Item
            key={$i18n.t('settings.label--threema-work-username', '{fullAppName} Username', {
              fullAppName: import.meta.env.APP_NAME,
            })}
          >
            <Text text={$profileViewModelStore.workUsername ?? '-'} selectable={true} />
          </KeyValueList.Item>
        {/if}

        <!--Not implemented yet-->
        {#if import.meta.env.DEBUG}
          <KeyValueList.ItemWithDropdown
            items={profilePictureShareWithItems}
            key={`🐞 ${$i18n.t(
              'settings--profile.label--profile-picture-visibility',
              'Who can see your profile picture?',
            )}`}
            options={{disabled: false}}
          >
            <Text
              text={getProfilePictureShareWithDropdownLabel(
                settings.profilePictureShareWith.group,
                $i18n,
              )}
            ></Text>
          </KeyValueList.ItemWithDropdown>
        {/if}
        <KeyValueList.ItemWithButton
          icon="content_copy"
          key={$i18n.t('settings--profile.label--threema-id', '{shortAppName} ID', {
            shortAppName: import.meta.env.SHORT_APP_NAME,
          })}
          onclick={handleClickCopyThreemaId}
        >
          <Text text={$profileViewModelStore.identity} />
        </KeyValueList.ItemWithButton>

        <KeyValueList.ItemWithButton icon="chevron_right" key="" onclick={handleClickPublicKeyItem}>
          <Text text={$i18n.t('settings--profile.label--public-key', 'Public Key')}></Text>
        </KeyValueList.ItemWithButton>
      </KeyValueList.Section>
      <KeyValueList.Section title="">
        <KeyValueList.ItemWithButton
          icon="delete_forever"
          key=""
          onclick={() => (modalState = 'delete-profile')}
        >
          <Text
            text={$i18n.t(
              'settings--profile.label--delete-profile',
              'Remove {shortAppName} ID and Data',
              {
                shortAppName: import.meta.env.SHORT_APP_NAME,
              },
            )}
          />
        </KeyValueList.ItemWithButton>
      </KeyValueList.Section>
    </KeyValueList>
  </div>

  {#if modalState === 'none'}
    <!-- No modal is displayed in this state. -->
  {:else if modalState === 'profile-picture'}
    <ProfilePictureModal
      alt={$i18n.t('settings.hint--own-profile-picture', 'My profile picture')}
      color={$profileViewModelStore.profilePicture.color}
      initials={$profileViewModelStore.initials}
      onclose={handleCloseModal}
      pictureBytes={$profileViewModelStore.profilePicture.picture}
    />
  {:else if modalState === 'public-key'}
    <PublicKeyModal onclose={handleCloseModal} publicKey={$profileViewModelStore.publicKey} />
  {:else if modalState === 'delete-profile'}
    <DeleteProfileModal onclose={handleCloseModal} {services} />
  {:else}
    {unreachable(modalState)}
  {/if}
{/if}
