<!--
  @component Renders details about the user's own profile.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import EditNicknameModal from '~/app/ui/components/partials/modals/edit-nickname-modal/EditNicknameModal.svelte';
  import EditPictureModal from '~/app/ui/components/partials/modals/edit-picture-modal/EditPictureModal.svelte';
  import type {ProfileInfoProps} from '~/app/ui/components/partials/settings/internal/profile-settings/internal/profile-info/props';
  import type {ModalState} from '~/app/ui/components/partials/settings/internal/profile-settings/types';
  import {i18n} from '~/app/ui/i18n';
  import UserProfilePicture from '~/app/ui/svelte-components/threema/ProfilePicture/ProfilePicture.svelte';
  import {transformProfilePicture} from '~/common/dom/ui/profile-picture';
  import {unreachable} from '~/common/utils/assert';

  const {
    color,
    displayName,
    nickname,
    initials,
    pictureBytes,
    onclickprofilepicture,
    updateProfilePicture,
    updateNickname,
  }: ProfileInfoProps = $props();

  let modalState = $state<ModalState>({type: 'none'});

  // The standalone custom-onprem (F1Whisper) build is self-hosted with no MDM/work cockpit, so the
  // user owns their own profile: mirror the profile-picture editor and let consumer/sandbox/custom
  // builds edit the nickname too.
  const canEditProfile =
    import.meta.env.BUILD_VARIANT === 'consumer' ||
    import.meta.env.BUILD_ENVIRONMENT === 'sandbox' ||
    import.meta.env.BUILD_VARIANT === 'custom';

  function handleClickEditNickname(): void {
    modalState = {
      type: 'nickname',
      props: {
        currentNickname: nickname ?? '',
        onsave: (newNickname) => {
          updateNickname(newNickname);
          modalState = {type: 'none'};
        },
        onclose: () => {
          modalState = {type: 'none'};
        },
      },
    };
  }
</script>

<div class="profile-info">
  <button class="profile-picture" onclick={onclickprofilepicture}>
    <UserProfilePicture
      alt={$i18n.t('settings.hint--own-profile-picture', 'My profile picture')}
      {color}
      {initials}
      img={transformProfilePicture(pictureBytes)}
      shape="circle"
    />
  </button>

  <div class="nickname">
    <div class="label">{$i18n.t('settings.label--nickname', 'Nickname')}</div>
    <div class="row">
      <div class="value">{displayName}</div>
      {#if canEditProfile}
        <button class="edit" onclick={handleClickEditNickname}>
          <Text
            color="inherit"
            family="secondary"
            size="body-small"
            text={$i18n.t('common.action--edit', 'Edit')}
          />
        </button>
      {/if}
    </div>
  </div>

  <!--
    As long as we don't support MDM params, we disable profile picture edit for work and onprem.
    The standalone custom-onprem (F1Whisper) build is self-hosted with no MDM/work cockpit, so the
    user owns their own profile picture: enable the editor for it.
  -->
  {#if canEditProfile}
    <button
      class="edit edit-picture"
      onclick={() => {
        modalState = {
          type: 'picture',
          props: {
            title: $i18n.t('dialog--edit-profile-picture.label--title', 'Edit Profile Photo'),
            blob: transformProfilePicture(pictureBytes),
            color,
            placeholder: {type: 'initials', initials},
            onsubmit: (img) => {
              updateProfilePicture(img);
              modalState = {type: 'none'};
            },
            onclose: () => {
              modalState = {type: 'none'};
            },
          },
        };
      }}
    >
      <Text
        color="inherit"
        family="secondary"
        size="body-small"
        text={$i18n.t('settings--profile.action--edit-picture', 'Edit picture')}
      />
    </button>
  {/if}

  {#if modalState.type === 'none'}
    <!-- No modal is displayed in this state. -->
  {:else if modalState.type === 'picture'}
    <EditPictureModal {...modalState.props}></EditPictureModal>
  {:else if modalState.type === 'nickname'}
    <EditNicknameModal {...modalState.props}></EditNicknameModal>
  {:else}
    {unreachable(modalState)}
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .profile-info {
    display: grid;
    grid-template-columns: fit-content(50%) 1fr;
    align-items: center;
    justify-items: start;
    column-gap: rem(16px);

    .profile-picture {
      @extend %neutral-input;
      --c-profile-picture-size: #{rem(60px)};
      cursor: pointer;
    }

    .nickname {
      display: flex;
      flex-direction: column;

      .label {
        @extend %font-small-400;
        color: var(--t-text-e2-color);
      }

      .row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: rem(8px);

        .value {
          user-select: all;
        }
      }
    }

    .edit {
      @extend %neutral-input;
      color: var(--t-color-primary);
      cursor: pointer;
    }

    .edit-picture {
      justify-self: center;
    }
  }
</style>
