<!--
  @component Renders details about the user's own profile.
-->
<script lang="ts">
  import type {ProfileInfoProps} from '~/app/ui/components/partials/settings/internal/profile-settings/internal/profile-info/props';
  import {i18n} from '~/app/ui/i18n';
  import UserProfilePicture from '~/app/ui/svelte-components/threema/ProfilePicture/ProfilePicture.svelte';
  import {transformProfilePicture} from '~/common/dom/ui/profile-picture';

  const {color, displayName, initials, onclickprofilepicture, pictureBytes}: ProfileInfoProps =
    $props();
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
    <div class="value">{displayName}</div>
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .profile-info {
    display: flex;
    align-items: center;
    justify-content: start;
    gap: rem(16px);

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

      .value {
        user-select: all;
      }
    }
  }
</style>
