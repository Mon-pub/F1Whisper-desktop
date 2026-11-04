<script lang="ts">
  import type {u53} from '@threema/ts-utils/integer/u53';
  import {TIMER} from '@threema/ts-utils/timer/global-timer';
  import type {TimerCanceller} from '@threema/ts-utils/timer/timer-canceller';
  import {onMount, type Component} from 'svelte';

  import {globals} from '~/app/globals';
  import type {AppServicesForSvelte} from '~/app/types';
  import GroupCallActivity from '~/app/ui/components/partials/call-activity/GroupCallActivity.svelte';
  import IncomingCallO2o from '~/app/ui/components/partials/call-activity/o2o/IncomingCallO2o.svelte';
  import O2oCallActivity from '~/app/ui/components/partials/call-activity/o2o/O2oCallActivity.svelte';
  import {o2oCallPresentationStore} from '~/app/ui/components/partials/call-activity/o2o/presentation';
  import ContactDetail from '~/app/ui/components/partials/contact-detail/ContactDetail.svelte';
  import ConversationView from '~/app/ui/components/partials/conversation/ConversationView.svelte';
  import ConversationNav from '~/app/ui/components/partials/conversation-nav/ConversationNav.svelte';
  import GroupDetail from '~/app/ui/components/partials/group-detail/GroupDetail.svelte';
  import EditGroupMembersModal from '~/app/ui/components/partials/modals/edit-group-members-modal/EditGroupMembersModal.svelte';
  import NavBar from '~/app/ui/components/partials/navbar/NavBar.svelte';
  import ReceiverNav from '~/app/ui/components/partials/receiver-nav/ReceiverNav.svelte';
  import Settings from '~/app/ui/components/partials/settings/Settings.svelte';
  import NavSettingsList from '~/app/ui/components/partials/settings-nav/SettingsNav.svelte';
  import VoicePlaybackBanner from '~/app/ui/components/partials/voice-playback-banner/VoicePlaybackBanner.svelte';
  import MainWelcome from '~/app/ui/components/partials/welcome/Welcome.svelte';
  import DebugPanel from '~/app/ui/debug/DebugPanel.svelte';
  import ChangePassword from '~/app/ui/modal/ChangePassword.svelte';
  import NetworkAlert from '~/app/ui/notification/NetworkAlert.svelte';
  import Snackbar from '~/app/ui/snackbar/Snackbar.svelte';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import {DisplayModeObserver, manageLayout} from '~/common/dom/ui/layout';
  import {display, layout} from '~/common/dom/ui/state';
  import type {IGlobalPropertyModel} from '~/common/model/types/settings';
  import type {ModelStore} from '~/common/model/utils/model-store';
  import {ConnectionState} from '~/common/network/protocol/state';
  import {unreachable} from '~/common/utils/assert';
  import type {Remote} from '~/common/utils/endpoint';
  import type {RemoteStore} from '~/common/utils/store';
  import type {OngoingO2oCallViewModelBundle} from '~/common/viewmodel/o2o-call/activity';

  const log = globals.unwrap().uiLogging.logger('ui.component.app');

  interface AppProps {
    services: AppServicesForSvelte;
    applicationState: Promise<Remote<ModelStore<IGlobalPropertyModel<'applicationState'>>>>;
  }

  const {services, applicationState}: AppProps = $props();

  // Unpack services.
  const {connectionState} = services.backend;
  const {debugPanelState} = services.storage;
  const {router} = services;

  // Create display mode observer.
  const displayModeObserver = new DisplayModeObserver(display);

  // Initialize delayed connection state.
  let delayedConnectionState: ConnectionState | undefined = $state(undefined);
  let updateDelayedConnectionStateTimerCanceller: TimerCanceller | undefined = undefined;

  // Initialize activity display state.
  let activityDisplayState: 'collapsed' | 'expanded' = $state('collapsed');

  // Ongoing 1:1 (o2o) call, driven by the global ongoing-call store (NOT the router, unlike group
  // calls). When non-null it drives the o2o call UI: the `ringing-in` status shows the incoming-call
  // ring overlay, every other (non-`ended`) status shows the in-call activity panel.
  let ongoingO2oCallStore = $state<
    RemoteStore<Remote<OngoingO2oCallViewModelBundle> | undefined> | undefined
  >(undefined);
  const ongoingO2oCall = $derived(
    ongoingO2oCallStore === undefined ? undefined : $ongoingO2oCallStore,
  );
  // Subscribe to the call's own state store to know whether it's an incoming ring or an active call.
  // `$ongoingO2oCallState` is possibly `undefined` (the store itself may be `undefined`), so read it
  // with optional chaining.
  const ongoingO2oCallState = $derived(ongoingO2oCall?.state);
  const ongoingO2oCallStatus = $derived($ongoingO2oCallState?.call.status);
  const isIncomingO2oCallRinging = $derived(ongoingO2oCallStatus === 'ringing-in');
  const isO2oCallActive = $derived(
    ongoingO2oCall !== undefined && ongoingO2oCallStatus !== 'ringing-in',
  );

  function handleKeydown(event: KeyboardEvent): void {
    // Only trigger handler if `event.target` is the element itself.
    if (event.target !== event.currentTarget) {
      return;
    }

    // Toggle the debug panel with `Ctrl + D`.
    if (import.meta.env.DEBUG && event.ctrlKey && event.key === 'd') {
      event.preventDefault();

      // Toggle debug panel.
      $debugPanelState = $debugPanelState === 'show' ? 'hide' : 'show';
    }
  }

  function handleToggleExpandActivity(event?: Event): void {
    activityDisplayState = activityDisplayState === 'collapsed' ? 'expanded' : 'collapsed';
  }

  /**
   * Updates the `delayedConnectionState` with the given {@link ConnectionState} value, but only
   * after a certain delay has passed. This is used so that a short loss of connection won't cause
   * the network alert banner to be shown immediately.
   *
   * Note: If the connection state switches back to connected, it will be updated immediately.
   */
  function updateDelayedConnectionState(
    currentConnectionState: ConnectionState,
    delayMs: u53,
  ): void {
    // Clear previous delayed update, if one is already scheduled.
    updateDelayedConnectionStateTimerCanceller?.();

    if (currentConnectionState === ConnectionState.CONNECTED) {
      // If the `connectionState` has switched to connected, update the `delayedConnectionState`
      // immediately.
      delayedConnectionState = currentConnectionState;
    } else {
      // Else, start a timer to update it after `delayMs` has elapsed.
      updateDelayedConnectionStateTimerCanceller = TIMER.timeout(() => {
        delayedConnectionState = currentConnectionState;
      }, delayMs);
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const NavPanelComponent: Component<{
    services: AppServicesForSvelte;
  }> = $derived.by(() => {
    const id = $router.nav.id;
    switch (id) {
      case 'conversationList':
        return ConversationNav;
      case 'receiverList':
        return ReceiverNav;
      case 'settingsList':
        return NavSettingsList;
      default:
        return unreachable(id, `Unhandled nav panel router state: ${id}`);
    }
  });

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const MainPanelComponent: Component<{
    services: AppServicesForSvelte;
  }> = $derived.by(() => {
    const id = $router.main.id;
    switch (id) {
      case 'welcome':
        return MainWelcome;
      case 'conversation':
        return ConversationView;
      case 'settings':
        return Settings;
      default:
        return unreachable(id, `Unhandled main panel router state: ${id}`);
    }
  });

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const AsidePanelComponent:
    | Component<{
        services: AppServicesForSvelte;
      }>
    | undefined = $derived.by(() => {
    const id = $router.aside?.id;
    switch (id) {
      case undefined:
        return undefined;
      case 'contactDetails':
        return ContactDetail;
      case 'groupDetails':
        return GroupDetail;
      default:
        return unreachable(id, `Unhandled aside panel router state: ${id}`);
    }
  });

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const ModalComponent:
    | Component<{
        services: AppServicesForSvelte;
      }>
    | undefined = $derived.by(() => {
    const id = $router.modal?.id;
    switch (id) {
      case undefined:
        return undefined;
      case 'changePassword':
        return ChangePassword;
      case 'editGroupMembers':
        return EditGroupMembersModal;
      default:
        return unreachable(id, `Unhandled modal router state: ${id}`);
    }
  });

  $effect(() => {
    updateDelayedConnectionState($connectionState as unknown as ConnectionState, 3000);
  });

  onMount(() => {
    // Set initial display mode and manage the layout.
    displayModeObserver.update();
    const displayModeObserverUnsubscriber = manageLayout({display, router}, layout);

    // Listen for key events on `<body>`.
    document.body.addEventListener('keydown', handleKeydown);

    // Unmount cleanup callback.
    return () => {
      displayModeObserverUnsubscriber();
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  onMount(async () => {
    // Load the global ongoing 1:1 call store. It stays mounted for the app's lifetime and drives the
    // o2o call surfaces (incoming ring / in-call panel) reactively.
    await services.backend.viewModel
      .ongoingO2oCall()
      .then((store) => {
        ongoingO2oCallStore = store;
      })
      .catch((error: unknown) => {
        log.error('Failed to load the ongoing 1:1 call store', error);
      });
  });
</script>

<div class="wrapper" data-connection-state={delayedConnectionState}>
  {#if delayedConnectionState !== ConnectionState.CONNECTED}
    {#await applicationState then resolvedApplicationState}
      <NetworkAlert applicationState={resolvedApplicationState} />
    {/await}
  {/if}

  <div class="app" data-display={$display} data-layout={$layout[$display]}>
    <Snackbar />

    <!--
      Persistent voice-playback banner (F1Whisper fork). A fixed top overlay that self-positions
      (no grid slot); shown while a voice message plays and the user is not viewing its owning
      conversation. Placed before the panels/call activity so an expanded call paints over it.
    -->
    <VoicePlaybackBanner {services} />

    <!-- Nav Bar -->
    <div class="navbar">
      <NavBar {services} />
    </div>

    <!-- Sub-Nav Panel -->
    <nav class="subnav">
      <NavPanelComponent {services} />
    </nav>

    <!-- Main Panel -->
    <main>
      <MainPanelComponent {services} />
    </main>

    <!-- Aside Panel -->
    {#if AsidePanelComponent !== undefined}
      <aside class="aside">
        <AsidePanelComponent {services} />
      </aside>
    {/if}

    <!-- Activities panel -->
    {#if $router.activity?.id === 'call'}
      <aside class={`activity ${activityDisplayState}`}>
        <GroupCallActivity
          isExpanded={activityDisplayState === 'expanded'}
          ontoggleexpand={handleToggleExpandActivity}
          {services}
        />
      </aside>
    {:else if $router.activity?.id === undefined}{:else}
      {svelteUnreachable($router.activity?.id, {
        log,
        message: `Unhandled activity router state: ${$router.activity?.id}`,
      })}
    {/if}

    <!--
      Ongoing 1:1 (o2o) call in-call panel. Store-driven (not router-driven): shown whenever a 1:1
      call exists and is NOT an unanswered incoming ring. Reuses the same activity aside slot as the
      group call; the two are mutually exclusive at runtime (shared ongoing-call lock).
    -->
    {#if isO2oCallActive && ongoingO2oCall !== undefined}
      <aside
        class="o2o-activity"
        class:compact={$o2oCallPresentationStore === 'compact'}
        class:expanded={$o2oCallPresentationStore === 'expanded'}
      >
        <O2oCallActivity call={ongoingO2oCall} {services} />
      </aside>
    {/if}

    {#if ModalComponent !== undefined}
      <ModalComponent {services} />
    {/if}

    <!--
      Incoming 1:1 call ring overlay. Store-driven: mounted only while the o2o call is an unanswered
      incoming ring (`ringing-in`). Accepting/declining transitions the backend state, which unmounts
      it (and either promotes to the in-call panel above, or clears the store).
    -->
    {#if isIncomingO2oCallRinging && ongoingO2oCall !== undefined}
      <IncomingCallO2o call={ongoingO2oCall} {services} />
    {/if}
  </div>

  <!-- Debug Panel -->
  {#if $debugPanelState === 'show'}
    <footer>
      <DebugPanel {services} />
    </footer>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .wrapper {
    height: 100vh;
    display: grid;
    grid-template:
      'app   ' 1fr
      'debug ' auto;

    &:not([data-connection-state='3']) {
      grid-template:
        'network-alert' auto
        'app' 1fr
        'debug' auto;
    }

    > footer {
      z-index: $z-index-plus;
    }
  }

  .app {
    height: 100%;
    display: grid;
    color: var(--t-text-e1-color);
    overflow: hidden;

    %-panel {
      height: 100%;
      overflow: hidden;
      display: none;
    }

    .navbar {
      @extend %-panel;
    }

    .subnav {
      @extend %-panel;
      // F1Whisper fork: logical property (was `border-right`) so the separator faces the main panel
      // in RTL locales, where the grid is mirrored.
      border-inline-end: 1px solid var(--t-panel-gap-color);
    }

    main {
      @extend %-panel;
      background-color: var(--t-main-background-color);
    }

    .aside {
      @extend %-panel;
      background-color: var(--t-aside-background-color);
      border-left: 1px solid var(--t-panel-gap-color);
    }

    .activity {
      @extend %-panel;
      overflow: visible;

      display: grid;
      grid-template: 100% / minmax(0, 1fr);

      container: activity / size;
      background-color: var(--t-aside-background-color);
      border-left: 1px solid var(--t-panel-gap-color);
    }

    // Ongoing 1:1 call surface (F1Whisper fork, FU-H09). This fixed overlay is deliberately scoped
    // to the o2o activity; group calls retain the established collapsed rail / expanded grid panel.
    // `compact` is a floating call bar and `expanded` is a full-window overlay.
    .o2o-activity {
      position: fixed;
      z-index: $z-index-plus;

      display: grid;
      grid-template: 100% / minmax(0, 1fr);
      overflow: hidden;

      container: activity / size;
      background-color: var(--t-aside-background-color);
      color: var(--t-text-e1-color);

      &.compact {
        inset-block-end: rem(16px);
        inset-inline-start: 50%;
        transform: translateX(-50%);

        width: min(rem(420px), calc(100% - #{rem(32px)}));
        max-height: rem(96px);

        border: 1px solid var(--t-panel-gap-color);
        border-radius: rem(12px);
        box-shadow: 0 rem(4px) rem(16px) rgb(0 0 0 / 35%);
      }

      &.expanded {
        inset: 0;
        width: 100%;
        height: 100%;
      }
    }

    @mixin show($area) {
      grid-area: $area;
      display: grid;
    }

    // Small
    &[data-display='small'] {
      grid-template:
        'navbar main' 100%
        / #{rem(92px)} 1fr;

      &:has(:global(.activity.collapsed)) {
        grid-template:
          'navbar main activity' 100%
          / #{rem(92px)} 1fr #{rem(64px)};

        .activity {
          grid-area: activity;
        }
      }

      // Group call activity is expanded (covers the entire view).
      &:has(:global(.activity.expanded)) {
        .activity {
          grid-area: navbar / navbar / main / main;
          border-left: none;
        }
      }

      // Group call activity is hidden or collapsed.
      &:not(:has(.activity.expanded)) {
        .navbar {
          @include show(navbar);
        }

        &[data-layout='nav'] {
          .subnav {
            @include show(main);
          }
        }

        &[data-layout='main'] {
          main {
            @include show(main);
          }
        }

        &[data-layout='aside'] {
          .aside {
            @include show(main);
          }
        }
      }
    }

    // Medium
    &[data-display='medium'] {
      grid-template:
        'navbar nav main' 100%
        / #{rem(92px)} #{rem(308px)} 1fr;

      &:has(:global(.activity.collapsed)) {
        grid-template:
          'navbar nav main activity' 100%
          / #{rem(92px)} #{rem(308px)} 1fr #{rem(64px)};

        .activity {
          grid-area: activity;
        }
      }

      // Group call activity is expanded (covers the entire view).
      &:has(:global(.activity.expanded)) {
        .activity {
          grid-area: navbar / navbar / main / main;
          border-left: none;
        }
      }

      // Group call activity is hidden or collapsed.
      &:not(:has(.activity.expanded)) {
        .navbar {
          @include show(navbar);
        }

        &[data-layout='nav-main'] {
          .subnav {
            @include show(nav);
          }
          main {
            @include show(main);
          }
        }

        &[data-layout='nav-aside'] {
          .subnav {
            @include show(nav);
          }
          .aside {
            @include show(main);
          }
        }
      }
    }

    // Large
    &[data-display='large'] {
      &[data-layout='nav-main'] {
        grid-template:
          'navbar nav main' 100%
          / #{rem(92px)} #{rem(308px)} 1fr;

        &:has(:global(.activity.collapsed)) {
          grid-template:
            'navbar nav main activity' 100%
            / #{rem(92px)} #{rem(308px)} 1fr #{rem(308px)};

          .activity {
            grid-area: activity;
          }
        }

        // Group call activity is expanded (covers the entire view).
        &:has(:global(.activity.expanded)) {
          .activity {
            grid-area: navbar / navbar / main / main;
            border-left: none;
          }
        }

        // Group call activity is hidden or collapsed.
        &:not(:has(.activity.expanded)) {
          .navbar {
            @include show(navbar);
          }

          .subnav {
            @include show(nav);
          }

          main {
            @include show(main);
          }
        }

        // Without the activity panel there's room to grow the nav panel two breakpoints earlier.
        @media screen and (min-width: 1280px) {
          grid-template:
            'navbar nav main' 100%
            / #{rem(92px)} #{rem(400px)} 1fr;
        }

        // With the collapsed activity panel visible, only grow nav at the very large breakpoint
        // (matching the nav-main-aside layout).
        @media screen and (min-width: 1720px) {
          &:has(:global(.activity.collapsed)) {
            grid-template:
              'navbar nav main activity' 100%
              / #{rem(92px)} #{rem(400px)} 1fr #{rem(308px)};
          }
        }
      }

      &[data-layout='nav-main-aside'] {
        // Compact tier (>= 1280px): keep nav/aside narrow and the collapsed activity panel at its
        // minimum, so `main` isn't squeezed between the two side panels.
        grid-template:
          'navbar nav main aside' 100%
          / #{rem(92px)} #{rem(308px)} 1fr #{rem(308px)};

        &:has(:global(.activity.collapsed)) {
          grid-template:
            'navbar nav main aside activity' 100%
            / #{rem(92px)} #{rem(308px)} 1fr #{rem(308px)} #{rem(64px)};

          .activity {
            grid-area: activity;
          }
        }

        // Group call activity is expanded (covers the entire view).
        &:has(:global(.activity.expanded)) {
          .activity {
            grid-area: navbar / navbar / aside / aside;
            border-left: none;
          }
        }

        // Group call activity is hidden or collapsed.
        &:not(:has(.activity.expanded)) {
          .navbar {
            @include show(navbar);
          }

          .subnav {
            @include show(nav);
          }

          main {
            @include show(main);
          }

          .aside {
            @include show(aside);
          }
        }

        // Without the activity panel (4 columns) there's room to grow nav/aside to their max width
        // here. With the collapsed activity panel present (5 columns), instead grow the activity
        // panel and keep the side panels narrow for one more breakpoint so `main` isn't starved.
        @media screen and (min-width: 1500px) {
          grid-template:
            'navbar nav main aside' 100%
            / #{rem(92px)} #{rem(400px)} 1fr #{rem(400px)};

          &:has(:global(.activity.collapsed)) {
            grid-template:
              'navbar nav main aside activity' 100%
              / #{rem(92px)} #{rem(308px)} 1fr #{rem(308px)} #{rem(308px)};
          }
        }

        // Very large: with all 5 columns visible, nav and aside can finally grow to their max width
        // too.
        @media screen and (min-width: 1720px) {
          &:has(:global(.activity.collapsed)) {
            grid-template:
              'navbar nav main aside activity' 100%
              / #{rem(92px)} #{rem(400px)} 1fr #{rem(400px)} #{rem(308px)};
          }
        }
      }
    }
  }
</style>
