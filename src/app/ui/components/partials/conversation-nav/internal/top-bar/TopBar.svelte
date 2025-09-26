<!--
  @component Renders a top bar with the user's profile picture and action buttons.
-->
<script lang="ts">
  import {onDestroy, onMount} from 'svelte';

  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import ContextMenuProvider from '~/app/ui/components/hocs/context-menu-provider/ContextMenuProvider.svelte';
  import type {TopBarProps} from '~/app/ui/components/partials/conversation-nav/internal/top-bar/props';
  import type Popover from '~/app/ui/generic/popover/Popover.svelte';
  import {i18n} from '~/app/ui/i18n';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import ProfilePicture from '~/app/ui/svelte-components/threema/ProfilePicture/ProfilePicture.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {transformProfilePicture} from '~/common/dom/ui/profile-picture';
  import {display} from '~/common/dom/ui/state';
  import {unreachable} from '~/common/utils/assert';

  const {
    initials,
    onclickprofilepicture,
    onclickreceiverlistbutton,
    onclicksettingsbutton,
    profilePicture,
    services,
  }: TopBarProps = $props();

  const {
    settings: {
      views: {work},
    },
    storage: {theme},
  } = services;

  let popover: SvelteNullableBinding<Popover> = $state(null);
  let systemTheme = $state<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );

  let prevLogoUrl: string | undefined = undefined;
  $effect(() => {
    if (prevLogoUrl !== undefined) {
      URL.revokeObjectURL(prevLogoUrl);
    }
    prevLogoUrl = currLogoUrl;
  });

  const currLogoUrl = $derived.by(() => {
    switch ($theme) {
      case 'light':
        return $work.logo.light !== undefined
          ? URL.createObjectURL(new Blob([$work.logo.light.blob]))
          : undefined;

      case 'dark':
        return $work.logo.dark !== undefined
          ? URL.createObjectURL(new Blob([$work.logo.dark.blob]))
          : undefined;

      case 'system':
        if (systemTheme === 'dark') {
          return $work.logo.dark !== undefined
            ? URL.createObjectURL(new Blob([$work.logo.dark.blob]))
            : undefined;
        }
        return $work.logo.light !== undefined
          ? URL.createObjectURL(new Blob([$work.logo.light.blob]))
          : undefined;

      default:
        return unreachable($theme);
    }
  });

  onMount(() => {
    // Event listener for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      systemTheme = event.matches ? 'dark' : 'light';
    });
  });

  onDestroy(() => {
    if (currLogoUrl !== undefined) {
      URL.revokeObjectURL(currLogoUrl);
    }
  });
</script>

<header
  class="container"
  data-build-platform={import.meta.env.BUILD_PLATFORM}
  data-display={$display}
>
  <button class="profile-picture" onclick={onclickprofilepicture} type="button">
    <ProfilePicture
      img={transformProfilePicture(profilePicture.picture)}
      alt={$i18n.t('contacts.hint--own-profile-picture')}
      {initials}
      color={profilePicture.color}
      shape="circle"
    />
  </button>

  <div class="logo">
    {#if currLogoUrl !== undefined}
      <img alt="logo" src={currLogoUrl} />
    {/if}
  </div>

  <div class="actions">
    <!-- <IconButton flavor="naked" class="wip">
        <ThreemaIcon
          on:click={() => {
            dispatch('click-chat');
          }}
          theme="Outlined">start_chat</ThreemaIcon
        >
      </IconButton> -->

    <IconButton flavor="naked" onclick={onclickreceiverlistbutton}>
      <MdIcon theme="Outlined">person_outline</MdIcon>
    </IconButton>

    <ContextMenuProvider
      bind:popover
      anchorPoints={{
        reference: {
          horizontal: 'right',
          vertical: 'bottom',
        },
        popover: {
          horizontal: 'right',
          vertical: 'top',
        },
      }}
      items={[
        // TODO(DESK-182): Make this dependent on MDM parameters.
        ...(import.meta.env.BUILD_VARIANT === 'consumer' ||
        import.meta.env.BUILD_ENVIRONMENT === 'sandbox'
          ? [
              {
                type: 'option',
                icon: {
                  name: 'person_add',
                  color: 'default',
                },
                label: $i18n.t('contacts.action--add-contact', 'New Contact'),
                handler: () =>
                  services.router.go({
                    nav: ROUTE_DEFINITIONS.nav.receiverList.withParams({
                      addressBookState: 'contact-add-form',
                    }),
                  }),
              } as const,
              {
                type: 'option',
                icon: {
                  name: 'group_add',
                  color: 'default',
                },
                label: $i18n.t('groups.action--add-group', 'New Group'),
                handler: () =>
                  services.router.go({
                    nav: ROUTE_DEFINITIONS.nav.receiverList.withParams({
                      addressBookState: 'group-add-form',
                    }),
                  }),
              } as const,
            ]
          : []),
        {
          type: 'option',
          icon: {
            name: 'settings',
            color: 'default',
          },
          label: $i18n.t('settings.label--title', 'Settings'),
          handler: onclicksettingsbutton ?? (() => {}),
        },
      ]}
      offset={{
        left: 0,
        top: 4,
      }}
      onclickitem={() => popover?.close()}
      triggerBehavior="toggle"
    >
      <IconButton flavor="naked">
        <MdIcon theme="Outlined">more_vert</MdIcon>
      </IconButton>
    </ContextMenuProvider>
  </div>
</header>

<style lang="scss">
  @use 'component' as *;

  $-profile-picture-size: rem(40px);

  .container {
    display: flex;
    align-items: center;
    justify-content: stretch;
    gap: rem(8px);

    width: 100%;
    padding: rem(12px) rem(8px) rem(12px) rem(16px);

    .profile-picture {
      order: 0;
      flex: 0 0 auto;

      @include def-var(--c-profile-picture-size, $-profile-picture-size);
      @include clicktarget-button-circle;
    }

    .logo {
      flex: 0 1 auto;
      order: 1;

      display: flex;
      align-items: center;
      justify-content: center;

      height: 100%;
      width: 100%;

      img {
        object-fit: contain;
        width: 100%;
        height: 100%;
        max-width: rem(140px);
      }
    }

    .actions {
      order: 2;
      flex: 0 0 auto;

      display: flex;
      align-items: center;
      justify-content: end;
    }

    &[data-build-platform='macos'] {
      padding: rem(12px) rem(8px) rem(12px) rem(92px);

      // Use as drag area for the Electron window.
      -webkit-app-region: drag;

      .profile-picture {
        display: none;
      }

      .logo {
        order: 0;
      }

      .actions {
        order: 1;

        // Keep item clickable in drag area.
        -webkit-app-region: no-drag;
      }
    }
  }
</style>
