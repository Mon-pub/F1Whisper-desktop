<!--
  @component Header shown at the top of a nav panel. Renders the (optional) logo in a fixed-height
  area, with the panel title below it.

  The logo area always reserves its height, so the title stays in the same spot regardless of
  whether a logo is present.
-->
<script lang="ts">
  import {untrack} from 'svelte';
  import {MediaQuery} from 'svelte/reactivity';
  import {cx} from 'tailwind-variants';

  import {getFallbackLogoUrl} from '~/app/ui/components/organisms/nav-panel-header/helper';
  import type {NavPanelHeaderProps} from '~/app/ui/components/organisms/nav-panel-header/props';
  import type {Theme} from '~/common/dom/ui/theme';

  const {services}: NavPanelHeaderProps = $props();

  const {
    settings: {
      views: {work},
    },
    storage: {theme},
  } = untrack(() => services);

  const prefersDark = new MediaQuery('(prefers-color-scheme: dark)');

  const finalTheme = $derived.by<Exclude<Theme, 'system'>>(() => {
    if ($theme === 'system') {
      return prefersDark.current ? 'dark' : 'light';
    }

    return $theme;
  });

  const logoBytes = $derived<Uint8Array | undefined>(
    finalTheme === 'dark' ? $work.logo.dark?.blob : $work.logo.light?.blob,
  );

  // Using `$effect` to assign a value is an antipattern, but is used here to be able to cleanly
  // create and revoke object URLs.
  let logoObjectUrl = $state<string | undefined>(undefined);
  $effect(() => {
    if (logoBytes === undefined) {
      logoObjectUrl = undefined;
      return undefined;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(logoBytes)]));
    logoObjectUrl = url;
    // Clean up url before the next one is created.
    return () => {
      URL.revokeObjectURL(url);
    };
  });

  // F1Whisper fork: the `custom` variant must never show the bundled Threema fallback logo (the old
  // TopBar rendered nothing unless the OPPF supplied a work logo). Only render the header, and thus
  // reserve its height, when there is a logo to show.
  const logoUrl = $derived<string | undefined>(
    logoObjectUrl ??
      (import.meta.env.BUILD_VARIANT === 'custom' ? undefined : getFallbackLogoUrl(finalTheme)),
  );
</script>

{#if logoUrl !== undefined}
  <header
    class={cx(
      'flex h-16 w-full flex-col items-center justify-center px-4 select-none',
      import.meta.env.BUILD_PLATFORM === 'macos' ? '[-webkit-app-region:drag]' : undefined,
    )}
  >
    <img
      class="h-full max-h-10 w-full max-w-52 object-contain"
      alt="logo"
      draggable="false"
      src={logoUrl}
    />
  </header>
{/if}
