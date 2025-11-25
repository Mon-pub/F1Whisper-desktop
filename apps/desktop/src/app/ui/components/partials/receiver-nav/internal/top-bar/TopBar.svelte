<!--
  @component Renders a top bar with a back button and action buttons.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {TopBarProps} from '~/app/ui/components/partials/receiver-nav/internal/top-bar/props';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {onclickback}: TopBarProps = $props();
</script>

<header class="container" data-build-platform={import.meta.env.BUILD_PLATFORM}>
  <div class="left">
    <IconButton flavor="naked" onclick={onclickback}>
      <MdIcon theme="Outlined">arrow_back</MdIcon>
    </IconButton>
  </div>

  <div class="center">
    <Text
      text={$i18n.t('contacts.label--contacts', 'Contacts')}
      color="mono-high"
      ellipsis
      family="secondary"
      size="body"
      wrap={false}
    />
  </div>

  <div class="right">
    <IconButton flavor="naked" onclick={onclickback}>
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
    }

    &[data-build-platform='macos'] {
      grid-template:
        'left center right' min-content
        / rem(88px) auto rem(88px);

      // Use as drag area for the Electron window.
      -webkit-app-region: drag;

      .left {
        display: none;
      }

      .right {
        // Keep item clickable in drag area.
        -webkit-app-region: no-drag;
      }
    }
  }
</style>
