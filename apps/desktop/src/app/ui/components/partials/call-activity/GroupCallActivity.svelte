<!--
  @component Renders the group call activity sidebar.
-->
<script lang="ts">
  import {byteEquals} from '@threema/ts-utils/byte/byte-equals';
  import {onDestroy, onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import {size} from '~/app/ui/actions/size';
  import type {GroupCallActivityProps} from '~/app/ui/components/partials/call-activity/props';
  import {isVideoFeedType} from '~/app/ui/components/partials/call-participant-feed/props';
  import {CallAudioController} from '~/app/ui/components/partials/call-shared/call-audio-controller';
  import {
    buildLocalFeed,
    buildLocalScreen,
    buildRemoteFeeds,
    sortFeeds,
    type FeedProps,
  } from '~/app/ui/components/partials/call-shared/feeds';
  import {
    startCall,
    type AnyExtendedGroupCallContextAbort,
    attachLocalDeviceAndAnnounceCaptureState,
    type ActivityLayout,
  } from '~/app/ui/components/partials/call-shared/helpers';
  import ControlBar from '~/app/ui/components/partials/call-shared/internal/control-bar/ControlBar.svelte';
  import TopBar from '~/app/ui/components/partials/call-shared/internal/top-bar/TopBar.svelte';
  import VideoPanel from '~/app/ui/components/partials/call-shared/internal/video-panel/VideoPanel.svelte';
  import {createCallMediaHandlers} from '~/app/ui/components/partials/call-shared/media-handlers';
  import type {AugmentedOngoingGroupCallViewModelBundle} from '~/app/ui/components/partials/call-shared/transformer';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbGroupReceiverLookup} from '~/common/db';
  import {assert, assertUnreachable, unreachable, unwrap} from '~/common/utils/assert';
  import type {Remote} from '~/common/utils/endpoint';
  import {AbortRaiser} from '~/common/utils/signal';
  import type {RemoteStore} from '~/common/utils/store';
  import type {ConversationViewModelBundle} from '~/common/viewmodel/conversation/main';
  import type {SelfReceiverData} from '~/common/viewmodel/utils/receiver';

  const {isExpanded, ontoggleexpand, services}: GroupCallActivityProps = $props();

  const FEED_MIN_WIDTH_PX = 256;
  const FEED_PADDING_PX = 16;

  const {router, electron} = services;
  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.call-activity');

  const audio = new CallAudioController(log);

  let containerLayout = $state<ActivityLayout>('regular');
  let feedContainerElement = $state<SvelteNullableBinding<HTMLDivElement>>(null);
  let audioElement = $state<SvelteNullableBinding<HTMLAudioElement>>(null);
  let videoPanelComponent = $state<SvelteNullableBinding<VideoPanel>>(null);

  let isFullView = $state<boolean>(false);

  let audioSinkDeviceId = $state<string | undefined>(undefined);

  const {
    guard: localDevicesGuard,
    localDevices,
    selectAudioInput,
    selectAudioOutput,
    selectVideo,
    toggleMicrophone,
    toggleCamera,
    toggleScreenSharing,
    updateCameraSubscription,
    updateScreenSubscription,
    initializeCaptureDevices,
    stopCapture,
  } = createCallMediaHandlers({
    services,
    log,
    electron,
    i18n,
    getCall: () => call,
    getStop: () => stop,
    setAudioSink: (deviceId) => {
      audioSinkDeviceId = deviceId;
    },
  });

  let user = $state<RemoteStore<SelfReceiverData> | undefined>(undefined);
  services.backend.viewModel
    .user()
    .then((user_) => (user = user_))
    .catch(assertUnreachable);

  const localFeed = $derived(
    user !== undefined && $user !== undefined
      ? buildLocalFeed({
          user: $user,
          localDevices: $localDevices,
          container: feedContainerElement,
          updateCameraSubscription,
          updateScreenSubscription,
        })
      : undefined,
  );

  const localScreen = $derived(
    user !== undefined && $user !== undefined
      ? buildLocalScreen({
          user: $user,
          localDevices: $localDevices,
          container: feedContainerElement,
          updateCameraSubscription,
          updateScreenSubscription,
        })
      : undefined,
  );

  let stop = $state<AbortRaiser<AnyExtendedGroupCallContextAbort> | undefined>(undefined);
  let call = $state.raw<AugmentedOngoingGroupCallViewModelBundle | undefined>(undefined);
  let remoteFeeds = $state<readonly FeedProps<'remoteVideo' | 'remoteScreen'>[]>([]);

  const feeds = $derived(
    sortFeeds([
      ...(localFeed !== undefined ? [localFeed] : []),
      ...(localScreen !== undefined ? [localScreen] : []),
      ...remoteFeeds,
    ]),
  );
  const supportedFeatures = $derived(call?.context.supportedFeatures);
  const callsSettings = $derived(services.settings.views.calls);

  function handleChangeSizeContainerElement(
    event: CustomEvent<{entries: ResizeObserverEntry[]}>,
  ): void {
    const width = event.detail.entries[0]?.contentRect.width;

    requestAnimationFrame(() => {
      containerLayout = (width ?? 0) < FEED_MIN_WIDTH_PX ? 'pocket' : 'regular';
    });
  }

  function handleToggleExpand(event: Event): void {
    // Bubble event.
    ontoggleexpand?.(event);
  }

  function handleChangeFullView(newIsFullView: boolean): void {
    if (isFullView !== newIsFullView) {
      isFullView = newIsFullView;

      if (newIsFullView && !isExpanded) {
        ontoggleexpand?.();
      }
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    if (isExpanded && event.key === 'Escape') {
      handleToggleExpand(event);
    }
  }

  function handleClickLeaveCall(): void {
    // Stop any ongoing call
    stop?.raise({origin: 'ui-component', cause: 'user-hangup'});

    // Navigate away
    //
    // Note: This automatically stops capturing.
    router.go({activity: 'close'});
  }

  // Setup media devices at startup.
  //
  // Note: Microphone capture will be 'on' by default whereas camera capture will be 'off' by
  // default. However, the call may auto-mute the microphone after joining.
  initializeCaptureDevices({microphone: true, camera: false});
  // Speakers
  const {lastSelectedSpeakers} = services.settings.views.calls.get();
  audio
    .resolveInitialSink(lastSelectedSpeakers)
    .then((deviceId) => {
      if (deviceId !== undefined) {
        audioSinkDeviceId = deviceId;
      }
    })
    .catch((error) => {
      log.error(`Error setting initial speaker device: ${error}`);
    });

  async function start(
    conversation: Remote<ConversationViewModelBundle>,
    intent: 'join' | 'join-or-create',
  ): Promise<void> {
    // Stop any previous call
    stop?.raise({origin: 'ui-component', cause: 'switching-call'});

    // Reset call state when stopped
    const stop_ = new AbortRaiser<AnyExtendedGroupCallContextAbort>();
    stop = stop_;
    stop_.subscribe((event) => {
      log.info('Group call stopped', event);

      switch (event.cause) {
        case 'disconnected':
          toast.addSimpleFailure(
            $i18n.t(
              'messaging.error--call-disconnected',
              'Call ended because the connection was interrupted',
            ),
          );
          break;

        case 'group-left-kicked-or-removed':
          toast.addSimpleFailure(
            $i18n.t(
              'messaging.error--call-group-left-kicked-or-removed',
              'Group call ended because you left the group',
            ),
          );
          break;

        case 'group-calls-disabled':
          toast.addSimpleFailure(
            $i18n.t('messaging.error--call-group-calls-disabled', 'Group calls are disabled'),
          );
          break;

        case 'call-not-running':
          toast.addSimpleFailure(
            $i18n.t('messaging.error--call-not-running', 'Call has already ended'),
          );
          break;

        case 'call-full':
          toast.addSimpleFailure(
            $i18n.t(
              'messaging.error--call-group-full',
              'Maximum reached: No more participants can join this group call',
            ),
          );
          break;

        case 'disconnected-due-to-inactivity':
          toast.addSimple(
            $i18n.t(
              'messaging.error--call-disconnected-due-to-inactivity',
              'Call ended due to inactivity',
            ),
          );
          break;

        case 'destroy':
          // UI component which hosted the group call was destroyed. Just show the user an info that
          // the group call has ended.
          toast.addSimple($i18n.t('messaging.hint--call-ended', 'Call ended'));
          break;

        case 'user-hangup':
        case 'switching-call':
          // No toast, as these are fairly regular (mostly expected) events which should be silent.
          break;

        case 'unexpected-error':
          // Generic, unknown errors.
          toast.addSimpleFailure(
            $i18n.t(
              'messaging.error--call-unexpected-error',
              'Call ended due to an unexpected error',
            ),
          );
          break;

        default:
          unreachable(event);
      }

      // Stop any ongoing screen share
      localDevicesGuard
        .with(
          (store) => store.get().screen?.track.dispatchEvent(new Event('ended')),
          'select-screen',
        )
        .catch((error) => {
          log.error(`Stopping screen sharing failed`, error);
        });

      // Reset call state
      stop = undefined;
      call = undefined;
      remoteFeeds = [];

      // Navigate away, if needed
      if (
        event.origin !== 'ui-component' ||
        (event.cause !== 'switching-call' && event.cause !== 'destroy')
      ) {
        router.go({activity: 'close'});
      }
    });

    // Start call
    try {
      call = await startCall(services, log, conversation, intent, stop_);
    } catch (error) {
      if (!stop_.aborted) {
        log.error('Unable to start group call', error);
        stop_.raise({origin: 'ui-component', cause: 'unexpected-error'});
      }
      return;
    }
    if (call === undefined) {
      assert(intent === 'join');
      log.debug('Intent to join but group call already stopped');
      router.go({activity: 'close'});
      return;
    }

    // Update remote feeds whenever there is a change to the remote participant state
    //
    // Note: This automatically unsubscribes updates to the view once the call stops.
    stop_.subscribe(
      call.state.subscribe((state) => {
        if (call === undefined || stop === undefined) {
          return;
        }

        // Update feeds state
        remoteFeeds = buildRemoteFeeds(state.remote, {
          container: feedContainerElement,
          updateCameraSubscription,
          updateScreenSubscription,
        });
      }),
    );

    // Attach local tracks to local transceivers, mute microphone if desired by the group call and
    // otherwise announce devices as defined by the user.
    //
    // Note: Because starting the call is async and the user may change the capture state in
    // between, we'll need to do this explicitly here.
    localDevicesGuard
      .with(async (store) => {
        if (call === undefined) {
          return;
        }
        const {microphone, camera} = store.get();
        await attachLocalDeviceAndAnnounceCaptureState(
          localDevicesGuard,
          call,
          store,
          'microphone',
          microphone === undefined
            ? undefined
            : {
                state:
                  call.state.get().local.capture.microphone.state === 'off'
                    ? 'off'
                    : microphone.state,
                track: microphone.track,
              },
        );
        await attachLocalDeviceAndAnnounceCaptureState(
          localDevicesGuard,
          call,
          store,
          'camera',
          camera,
        );
      }, 'attach')
      .catch((error) => {
        log.error(`Attaching local capture devices to new call failed`, error);
        stop?.raise({origin: 'ui-component', cause: 'unexpected-error'});
      });
  }

  // Start call and switch whenever the receiver changes.
  //
  // Note: The current device states intentionally transition into the next call.
  let group = $state<DbGroupReceiverLookup | undefined>(undefined);
  // Use `$state.raw` so that Svelte doesn't use proxies.
  let conversation = $state.raw<Remote<ConversationViewModelBundle> | undefined>(undefined);
  let store = $state<Remote<ConversationViewModelBundle>['viewModelStore'] | undefined>(undefined);

  $effect(() => {
    reactive(() => {
      if ($router.activity?.id === 'call') {
        const {receiverLookup: receiver, intent} = $router.activity.params;
        if (group?.uid !== receiver.uid) {
          group = receiver;
          services.backend.viewModel
            .conversation(receiver)
            .then(async (conversation_) => {
              conversation = unwrap(conversation_);
              store = conversation.viewModelStore;

              return await start(conversation, intent);
            })
            .catch(assertUnreachable);
        }
      } else {
        group = undefined;
        conversation = undefined;
        store = undefined;
      }
    }, [$router]);
  });

  // Switch to chosen call when it changes while we're in a call.
  //
  // Note: `conversation` and `store` change whenever we switch to a different group.
  // `$store.call.id` will then give us a different Group Call ID if the chosen call is different to
  // the one we are currently in which is our indicator to switch.
  $effect(() => {
    reactive(() => {
      if (
        conversation !== undefined &&
        store !== undefined &&
        call !== undefined &&
        $store?.call?.id !== undefined &&
        !byteEquals(call.context.callId.bytes, $store.call.id.bytes)
      ) {
        log.debug('Switching to chosen group call');
        start(conversation, 'join').catch(assertUnreachable);
      }
    }, [$store?.call?.id]);
  });

  $effect(() => {
    reactive(() => {
      audio.updateFeeds(audioElement, feeds).catch((error) => {
        log.error(`Error updating audio feeds: ${error}`);
      });
    }, [audioElement, feeds]);
  });

  $effect(() => {
    audio.updateSink(audioElement, audioSinkDeviceId, feeds).catch((error) => {
      log.error(`Error updating audio sink: ${error}`);
    });
  });

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);

    return () => window.removeEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    // Stop any ongoing call.
    stop?.raise({origin: 'ui-component', cause: 'destroy'});

    // Stop capturing.
    stopCapture();

    // Tear down the audio graph.
    audio.close();
  });
</script>

<div
  use:size
  class="container"
  class:expanded={isExpanded}
  style:--c-t-feed-padding={`${FEED_PADDING_PX}px`}
  data-layout={containerLayout}
  onchangesize={handleChangeSizeContainerElement}
>
  <div class="top-bar">
    <TopBar
      {containerLayout}
      {isExpanded}
      {isFullView}
      onclickgridview={(event) => {
        videoPanelComponent?.setGridView();
      }}
      onclicktoggleexpand={(event) => {
        handleToggleExpand(event);
      }}
      state={call === undefined
        ? {type: 'connecting'}
        : {
            type: 'connected',
            startedAt: call.context.startedAt,
            nParticipants: feeds.filter((feed) => isVideoFeedType(feed.type)).length,
          }}
    />
  </div>

  <div bind:this={feedContainerElement} class="content">
    <audio bind:this={audioElement} autoplay playsinline></audio>

    <div class="feeds">
      <VideoPanel
        bind:this={videoPanelComponent}
        {feeds}
        activity={{isExpanded, layout: containerLayout}}
        onchangefullview={handleChangeFullView}
        {services}
      ></VideoPanel>
    </div>

    <div class="footer">
      <ControlBar
        currentAudioInputDeviceId={$localDevices.microphone?.track.getSettings().deviceId}
        currentAudioOutputDeviceId={audioSinkDeviceId}
        currentVideoDeviceId={$localDevices.camera?.track.getSettings().deviceId}
        lastSelectedVideoDeviceLabel={$callsSettings.lastSelectedCamera}
        isAudioEnabled={$localDevices.microphone?.track.enabled ?? false}
        isVideoEnabled={$localDevices.camera?.track.enabled ?? false}
        isScreenSharingEnabled={$localDevices.screen?.track.enabled ?? false}
        onclickleavecall={handleClickLeaveCall}
        onclicktoggleaudio={() => toggleMicrophone('toggle')}
        onclicktogglevideo={() => toggleCamera('toggle')}
        onclicktogglescreensharing={toggleScreenSharing}
        onselectaudioinputdevice={selectAudioInput}
        onselectaudiooutputdevice={selectAudioOutput}
        onselectvideodevice={selectVideo}
        options={{
          allowScreenSharing:
            // We can be sure that this feature is deployed in non-OnPrem builds.
            import.meta.env.BUILD_ENVIRONMENT === 'onprem'
              ? supportedFeatures?.screenShare
              : import.meta.env.BUILD_FLAVOR !== 'consumer-live',
        }}
      />
    </div>
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  $-vars: (feed-padding);
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  .container {
    display: grid;
    grid-template:
      'top-bar' rem(64px)
      'content' minmax(0, 1fr)
      / 100%;

    .top-bar {
      grid-area: top-bar;

      display: flex;
      align-items: center;
      justify-content: center;

      border-bottom: 1px solid var(--t-panel-gap-color);
      height: rem(64px);
    }

    .content {
      grid-area: content;

      display: grid;
      grid-template:
        'feeds' minmax(0, 1fr)
        'footer' minmax(0, auto)
        / 100%;

      position: relative;

      audio {
        display: none;
      }

      .feeds {
        grid-area: feeds / feeds / footer / footer;

        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: stretch;

        overflow-y: auto;
        padding: var($-temp-vars, --c-t-feed-padding) 0
          calc(224px + var($-temp-vars, --c-t-feed-padding)) 0;
        scroll-padding-bottom: calc(224px + var($-temp-vars, --c-t-feed-padding));
        scrollbar-width: none;
      }

      .footer {
        grid-area: footer;

        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;

        position: sticky;
        left: 0;
        right: 0;
        bottom: 0;

        // Important: This needs to be reset by children for them to be clickable!
        pointer-events: none;

        padding: 0 0 rem(12px);

        &::after {
          content: '';
          pointer-events: none;

          position: absolute;
          z-index: -1;
          background: linear-gradient(
            to top,
            var(--t-aside-background-color) 0%,
            var(--t-aside-background-color) 90%,
            transparent 100%
          );
          left: 0;
          right: 0;
          bottom: 0;
          height: calc(rem(224px) + var($-temp-vars, --c-t-feed-padding));
        }
      }
    }
  }

  .container[data-layout='regular'] {
    .top-bar {
      justify-content: stretch;
    }

    .content {
      grid-template:
        'feeds' minmax(0, 1fr)
        'footer' 88px
        / 100%;

      .feeds {
        padding: var($-temp-vars, --c-t-feed-padding);
        padding-bottom: calc(12px + 64px + var($-temp-vars, --c-t-feed-padding));
        scroll-padding-bottom: calc(12px + 64px + var($-temp-vars, --c-t-feed-padding));
      }

      .footer {
        padding: rem(12px);

        &::after {
          background: linear-gradient(
            to top,
            var(--t-aside-background-color) 0%,
            var(--t-aside-background-color) 25%,
            transparent 100%
          );
          height: rem(90px);
        }
      }
    }
  }

  .container[data-layout='pocket'],
  .container[data-layout='regular'] {
    &.expanded {
      background-color: rgb(38, 38, 38);

      .top-bar {
        border-bottom: 1px solid transparent;
      }

      .content .footer::after {
        background: linear-gradient(to top, rgb(38, 38, 38) 0%, transparent 100%);
      }
    }
  }
</style>
