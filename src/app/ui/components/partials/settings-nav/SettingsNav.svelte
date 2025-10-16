<!--
  @component Renders the settings navigation sidebar.
-->
<script lang="ts">
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import SettingsNavList from '~/app/ui/components/partials/settings-nav/internal/settings-nav-list/SettingsNavList.svelte';
  import type {SettingsNavProps} from '~/app/ui/components/partials/settings-nav/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {services}: SettingsNavProps = $props();

  const {router} = services;

  function handleClickBack(): void {
    router.goToWelcome({nav: ROUTE_DEFINITIONS.nav.conversationList.withoutParams()});
  }
</script>

<div class="container" data-build-platform={import.meta.env.BUILD_PLATFORM}>
  <div class="top-bar">
    <div class="left">
      <IconButton flavor="naked" onclick={handleClickBack}>
        <MdIcon theme="Outlined">arrow_back</MdIcon>
      </IconButton>
    </div>

    <div class="center">
      <Text
        text={$i18n.t('settings.label--title')}
        color="mono-high"
        ellipsis
        family="secondary"
        size="body"
        wrap={false}
      />
    </div>

    <div class="right">
      <div class="chats">
        <IconButton flavor="naked" onclick={handleClickBack}>
          <MdIcon theme="Outlined">close</MdIcon>
        </IconButton>
      </div>
    </div>
  </div>

  <div class="list">
    <SettingsNavList {services} />
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    overflow: hidden;
    background-color: var(--t-nav-background-color);
    grid-template:
      'top-bar' min-content
      'list' 1fr
      / 100%;

    .top-bar {
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

        display: flex;
        align-items: center;
        justify-content: center;

        min-width: 0;
        max-width: 100%;
        overflow: hidden;
      }

      .right {
        grid-area: right;

        display: flex;
        align-items: center;
        justify-content: end;

        .chats {
          display: none;
        }
      }
    }

    .list {
      grid-area: list;
      overflow: hidden;
    }

    &[data-build-platform='macos'] {
      .top-bar {
        grid-template:
          'left center right' min-content
          / rem(88px) auto rem(88px);

        // Use as drag area for the Electron window.
        -webkit-app-region: drag;

        .left {
          display: none;
        }

        .right {
          .chats {
            display: unset;

            // Keep item clickable in drag area.
            -webkit-app-region: no-drag;
          }
        }
      }
    }
  }
</style>
