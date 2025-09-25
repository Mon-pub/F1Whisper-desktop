<!--
  @component Renders a top bar with a back button.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {TopBarProps} from '~/app/ui/components/partials/group-detail/internal/top-bar/props';
  import {i18n} from '~/app/ui/i18n';
  import type {I18nType} from '~/app/ui/i18n-types';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {display} from '~/common/dom/ui/state';

  const {onclickback, onclickclose}: TopBarProps = $props();

  function getTitle(currentI18n: I18nType): string {
    return currentI18n.t('groups.label--group-detail', 'Group Details');
  }
</script>

<header
  class="container"
  data-build-platform={import.meta.env.BUILD_PLATFORM}
  data-display={$display}
>
  <div class="left">
    <IconButton flavor="naked" onclick={onclickback}>
      <MdIcon theme="Outlined">arrow_back</MdIcon>
    </IconButton>
  </div>

  <div class="center">
    <Text
      text={getTitle($i18n)}
      color="mono-high"
      ellipsis
      family="secondary"
      size="body"
      wrap={false}
    />
  </div>

  <div class="right">
    <IconButton flavor="naked" onclick={onclickclose}>
      <MdIcon theme="Outlined">close</MdIcon>
    </IconButton>
  </div>
</header>

<style lang="scss">
  @use 'component' as *;

  .container {
    grid-area: top-bar;
    padding: rem(12px) rem(8px);
    display: grid;
    grid-template:
      'left center right' min-content
      / rem(40px) auto rem(40px);
    gap: rem(12px);
    align-items: center;

    .left {
      grid-area: left;
    }

    .center {
      grid-area: center;
      justify-self: center;

      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .right {
      grid-area: right;
    }

    &[data-display='large'] .left {
      visibility: hidden;
    }

    &:not([data-display='large']) .right {
      visibility: hidden;
    }

    &[data-build-platform='macos'] {
      // Use as drag area for the Electron window.
      -webkit-app-region: drag;

      &[data-display='small'] {
        grid-template:
          'left center right' min-content
          / rem(119px) auto rem(119px);

        .left {
          display: flex;
          align-items: center;
          justify-content: right;
        }
      }

      .left,
      .right {
        // Keep item clickable in drag area.
        -webkit-app-region: no-drag;
      }
    }
  }
</style>
