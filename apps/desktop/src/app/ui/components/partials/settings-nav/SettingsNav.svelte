<!--
  @component Renders the settings navigation sidebar.
-->
<script lang="ts">
  import NavPanelHeader from '~/app/ui/components/organisms/nav-panel-header/NavPanelHeader.svelte';
  import SettingsNavList from '~/app/ui/components/partials/settings-nav/internal/settings-nav-list/SettingsNavList.svelte';
  import type {SettingsNavProps} from '~/app/ui/components/partials/settings-nav/props';

  const {services}: SettingsNavProps = $props();
</script>

<div class="container">
  <div class="top-bar">
    <NavPanelHeader {services} />
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

      &:not(:empty) {
        margin-bottom: rem(8px);
      }
    }

    .list {
      grid-area: list;
      overflow: hidden;
    }
  }
</style>
