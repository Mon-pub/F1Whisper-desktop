<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {TopBarProps} from '~/app/ui/components/partials/group-add-form/internal/top-bar/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {onclickcancel}: TopBarProps = $props();
</script>

<header data-build-platform={import.meta.env.BUILD_PLATFORM}>
  <div class="center">
    <Text
      text={$i18n.t('groups.label--new-group', 'New Group')}
      color="mono-high"
      ellipsis
      family="secondary"
      size="body"
      wrap={false}
    />
  </div>
  <div class="right">
    <div class="close">
      <IconButton flavor="naked" onclick={onclickcancel}>
        <MdIcon theme="Outlined">close</MdIcon>
      </IconButton>
    </div>
  </div>
</header>

<style lang="scss">
  @use 'component' as *;

  header {
    display: grid;
    grid-template:
      'left center right'
      / 0 auto 0;
    grid-auto-flow: column;
    justify-content: space-between;
    place-items: center;

    height: 100%;
    user-select: none;

    .center {
      grid-area: center;

      display: flex;
      align-items: center;
      justify-content: center;

      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .right {
      grid-area: right;
      justify-self: right;
    }

    &[data-build-platform='macos'] {
      // Use as drag area for the Electron window.
      -webkit-app-region: drag;

      grid-template:
        'left center right'
        / rem(88px) auto rem(88px);

      .right {
        justify-self: right;

        .close {
          // Keep item clickable in drag area.
          -webkit-app-region: no-drag;
        }
      }
    }
  }
</style>
