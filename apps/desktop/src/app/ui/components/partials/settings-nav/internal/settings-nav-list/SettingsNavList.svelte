<!--
  @component Renders a list of settings nav items that link to the various settings pages.
-->
<script lang="ts">
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import {getSettingsNavItems} from '~/app/ui/components/partials/settings-nav/internal/settings-nav-list/helpers';
  import SettingsNavElement from '~/app/ui/components/partials/settings-nav/internal/settings-nav-list/internal/settings-nav-item/SettingsNavItem.svelte';
  import type {SettingsNavItemProps} from '~/app/ui/components/partials/settings-nav/internal/settings-nav-list/internal/settings-nav-item/props';
  import type {SettingsNavListProps} from '~/app/ui/components/partials/settings-nav/internal/settings-nav-list/props';
  import {i18n} from '~/app/ui/i18n';
  import {ensureSettingsCategory, type SettingsCategory} from '~/common/settings';

  const {services}: SettingsNavListProps = $props();

  const {router} = services;

  function handleClickItem(category: SettingsCategory): void {
    router.go({main: ROUTE_DEFINITIONS.main.settings.withParams({category})});
  }

  const settingsNavItems = $derived(
    Object.entries<SettingsNavItemProps>({
      ...getSettingsNavItems($i18n),
    }),
  );
</script>

<div class="settings-category-list">
  {#each settingsNavItems as [category, props] (category)}
    {@const isActive =
      $router.main.id === 'settings' ? $router.main.params.category === category : false}

    <div class="settings-category">
      <SettingsNavElement
        {isActive}
        onclick={() => handleClickItem(ensureSettingsCategory(category))}
        {...props}
      />
    </div>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .settings-category-list {
    max-height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
  }
</style>
