<!--
  @component Renders the participant feed (microphone / camera / shared screen) of a single receiver.
-->
<script lang="ts">
  import {onDestroy} from 'svelte';

  import {globals} from '~/app/globals';
  import {intersection, type IntersectionEventDetail} from '~/app/ui/actions/intersection';
  import {size} from '~/app/ui/actions/size';
  import Hint from '~/app/ui/components/atoms/hint/Hint.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {
    FeedType,
    ParticipantFeedProps,
  } from '~/app/ui/components/partials/call-participant-feed/props';
  import ProfilePicture from '~/app/ui/components/partials/profile-picture/ProfilePicture.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {Dimensions} from '~/common/types';
  import {unreachable} from '~/common/utils/assert';
  import {unusedProp} from '~/common/utils/svelte-helpers';

  const {
    activity,
    capture,
    container,
    isFullView = false,
    onclick,
    onclicktogglefullview,
    updateCameraSubscription,
    updateScreenSubscription,
    participantId,
    receiver,
    services,
    tracks,
    type,
  }: ParticipantFeedProps<FeedType> = $props();

  unusedProp(participantId);

  const log = globals.unwrap().uiLogging.logger('ui.component.participant-feed');

  let videoElement = $state<SvelteNullableBinding<HTMLVideoElement>>(null);

  let dimensions = $state<Dimensions | undefined>(undefined);
  let isInViewport = $state<boolean | undefined>(undefined);

  // Note: Caching mitigates re-attaching tracks to the `<video>` element, which would result in
  // video flickering.
  const cachedTracks = $state<{
    video: MediaStreamTrack | undefined;
  }>({video: undefined});

  $effect(() => {
    if (videoElement !== null) {
      const video =
        tracks.type === 'localScreen' || tracks.type === 'remoteScreen'
          ? tracks.screen
          : tracks.camera;
      if (video === undefined) {
        videoElement.srcObject = null;
      } else if (videoElement.srcObject === null || cachedTracks.video !== video) {
        videoElement.srcObject = new MediaStream([video]);
        cachedTracks.video = video;
      }
    }
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (['Space', 'Enter', 'NumpadEnter'].includes(event.code)) {
      onclick?.(event);
    }
  }

  function handleChangeSize(event: CustomEvent<{entries: ResizeObserverEntry[]}>): void {
    const entry: ResizeObserverEntry | undefined = event.detail.entries.at(0);
    if (entry === undefined) {
      return;
    }
    dimensions = {
      width: Math.round(entry.contentRect.width),
      height: Math.round(entry.contentRect.height),
    };
  }

  function handleEnterOrExit(event: CustomEvent<IntersectionEventDetail>): void {
    dimensions = {
      width: Math.round(event.detail.entry.target.clientWidth),
      height: Math.round(event.detail.entry.target.clientHeight),
    };
    isInViewport = event.detail.entry.isIntersecting;
  }

  function handleClickFullscreen(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (document.fullscreenElement === videoElement) {
      document.exitFullscreen().catch((error) => {
        log.warn('OnClick: Exiting fullscreen video failed', error);
      });
      return;
    }

    if (
      videoElement !== null &&
      document.fullscreenEnabled &&
      (capture.camera.state === 'on' || capture.screen.state === 'on')
    ) {
      if (Number.isNaN(videoElement.duration)) {
        videoElement.onloadedmetadata = requestFullscreen;
      } else {
        requestFullscreen();
      }
    }
  }

  function handleClickPictureInPicture(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (document.pictureInPictureElement === videoElement) {
      document.exitPictureInPicture().catch((error) => {
        log.warn('OnClick: Exiting PiP video failed', error);
      });
      return;
    }

    if (
      videoElement !== null &&
      document.pictureInPictureEnabled &&
      (capture.camera.state === 'on' || capture.screen.state === 'on')
    ) {
      if (Number.isNaN(videoElement.duration)) {
        videoElement.onloadedmetadata = requestPictureInPicture;
      } else {
        requestPictureInPicture();
      }
    }
  }

  // Track video stream health
  let unsubscribeVideoHealth: (() => void) | undefined = $state();
  let videoHealth: 'good' | 'stalled' | 'unknown' = $state('unknown');
  function videoHealthStalledHandler(): void {
    videoHealth = 'stalled';
  }
  function videoHealthGoodHandler(): void {
    videoHealth = 'good';
  }

  function requestFullscreen(): void {
    videoElement
      ?.requestFullscreen()
      .then(() => {
        dimensions = {
          width: screen.width,
          height: screen.height,
        };
      })
      .catch((error: Error) => {
        log.warn('Requesting fullscreen video failed', error);
      });
  }

  function requestPictureInPicture(): void {
    videoElement
      ?.requestPictureInPicture()
      .then((pictureInPictureWindow) => {
        dimensions = {
          width: Math.round(pictureInPictureWindow.height),
          height: Math.round(pictureInPictureWindow.width),
        };

        pictureInPictureWindow.onresize = ({target}) => {
          if (target instanceof PictureInPictureWindow) {
            dimensions = {
              width: Math.round(target.height),
              height: Math.round(target.width),
            };
          }
        };
      })
      .catch((error: Error) => {
        log.warn('Requesting PiP video failed', error);
      });
  }

  onDestroy(() => {
    if (document.pictureInPictureElement === videoElement) {
      document.exitPictureInPicture().catch((error) => {
        log.warn('OnDestroy: Exiting PiP video failed', error);
      });
    }
    unsubscribeVideoHealth?.();
  });

  $effect(() => {
    reactive(() => {
      const track =
        tracks.type === 'localScreen' || tracks.type === 'remoteScreen'
          ? tracks.screen
          : tracks.camera;
      unsubscribeVideoHealth?.();
      unsubscribeVideoHealth = undefined;
      videoHealth = 'unknown';

      if (track !== undefined) {
        track.addEventListener('mute', videoHealthStalledHandler);
        track.addEventListener('unmute', videoHealthGoodHandler);
        unsubscribeVideoHealth = () => {
          track.addEventListener('mute', videoHealthStalledHandler);
          track.addEventListener('unmute', videoHealthGoodHandler);
        };
        videoHealth = track.muted ? 'stalled' : 'good';
      }
    }, [
      tracks.type === 'localScreen' || tracks.type === 'remoteScreen'
        ? tracks.screen
        : tracks.camera,
    ]);
  });

  $effect(() => {
    if (isInViewport !== undefined && dimensions !== undefined) {
      if (type === 'remoteScreen') {
        updateScreenSubscription(isInViewport ? dimensions : undefined);
      } else {
        updateCameraSubscription(isInViewport ? dimensions : undefined);
      }
    }
  });

  const sizeObserverOptions = $derived({
    root: container,
    threshold: 0,
  });
</script>

<div
  use:size
  use:intersection={{options: sizeObserverOptions}}
  role="button"
  class="container"
  data-video-capture={type === 'remoteScreen' || type === 'localScreen'
    ? capture.screen.state
    : capture.camera.state}
  data-video-health={videoHealth}
  data-layout={activity.layout}
  data-type={type}
  onchangesize={handleChangeSize}
  {onclick}
  onkeydown={handleKeydown}
  onintersectionenter={handleEnterOrExit}
  onintersectionexit={handleEnterOrExit}
  tabindex="0"
>
  {#if activity.layout === 'pocket'}
    <ProfilePicture
      extraCharms={[
        {
          content: {
            type: 'icon',
            icon: capture.microphone.state === 'on' ? 'mic' : 'mic_off',
            family: 'material',
          },
          position: 130,
          style: {
            type: 'cutout',
            contentColor: 'white',
            gap: 2,
            backgroundColor:
              capture.microphone.state === 'on' ? 'var(--t-color-primary-600)' : 'red',
          },
        },
      ]}
      options={{
        hideDefaultCharms: true,
        isClickable: false,
      }}
      {receiver}
      {services}
      size="md"
    >
      {#snippet snippetOverlay()}
        <div class="video-container pocket">
          <video data-type={type} bind:this={videoElement} autoplay muted playsinline></video>
        </div>
      {/snippet}
    </ProfilePicture>
  {:else if activity.layout === 'regular'}
    <div class="video-container">
      <div class="placeholder" data-color={receiver.color}>
        <ProfilePicture
          options={{
            isClickable: false,
          }}
          {receiver}
          {services}
          size={isFullView ? 'lg' : 'md'}
        />
      </div>

      <div class="pip-indicator">
        {$i18n.t('messaging.label--call-video-pip-indicator', 'Picture-in-picture mode is active')}
      </div>
      <video data-type={type} bind:this={videoElement} autoplay muted playsinline></video>
    </div>

    <div class="header">
      <span class="actions">
        <Hint
          icon="info"
          id="participant-feed-expand-tooltip"
          position="bottom"
          text={isFullView
            ? $i18n.t('messaging.label--call-video-collapse', 'Collapse')
            : $i18n.t('messaging.label--call-video-expand', 'Expand')}
        >
          <button
            class="action full-view"
            onclick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              onclicktogglefullview?.(event);
            }}
          >
            {#if isFullView}
              <MdIcon theme="Filled">unfold_less</MdIcon>
            {:else}
              <MdIcon theme="Filled">unfold_more</MdIcon>
            {/if}
          </button>
        </Hint>

        <Hint
          icon="info"
          id="participant-feed-fullscreen-tooltip"
          position="bottom"
          text={$i18n.t('messaging.label--call-video-fullscreen', 'Full screen')}
        >
          <button class="action" onclick={handleClickFullscreen}>
            <MdIcon theme="Filled">fit_screen</MdIcon>
          </button>
        </Hint>

        <Hint
          icon="info"
          id="participant-feed-pip-tooltip"
          position="bottom"
          text={$i18n.t('messaging.label--call-video-pip', 'Picture-in-Picture')}
        >
          <button class="action" onclick={handleClickPictureInPicture}>
            <MdIcon theme="Filled">open_in_new</MdIcon>
          </button>
        </Hint>
      </span>
    </div>

    <div class="footer">
      <span class="pills left">
        <span class="pill name">
          <Text ellipsis family="primary" size="body-small" text={receiver.name} wrap={false} />
        </span>
      </span>

      <span class="pills right">
        <div class="pill control">
          <MdIcon theme="Outlined">
            {#if capture.microphone.state === 'on'}
              mic
            {:else}
              mic_off
            {/if}
          </MdIcon>
        </div>
      </span>
    </div>
  {:else}
    {unreachable(activity.layout)}
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    flex: 0 0 auto;

    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;

    position: relative;
    width: 100%;
    max-height: 100%;

    .header {
      display: flex;
      flex-direction: row;
      align-items: start;
      justify-content: end;
      gap: rem(8px);

      position: absolute;
      top: 0;
      width: 100%;
      // Needed for the tooltip to have enough space to open downwards.
      height: rem(128px);
      padding: rem(8px);

      // Defaults to hidden, and will only be displayed on hover of the feed.
      opacity: 0;
      border-top-left-radius: rem(10px);
      border-top-right-radius: rem(10px);
      overflow: clip;

      @include scrim-gradient(rgb(0, 0, 0), 'to bottom', 0.5);

      transition: opacity 0.1s ease-in-out;

      .actions {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        justify-content: end;
        gap: rem(4px);

        button.action {
          @include def-var(--c-icon-font-size, #{rem(18px)});
          @include clicktarget-button-circle;

          & {
            color: white;
            text-shadow: rgba(0, 0, 0, 0.5) 0 rem(1px) rem(3px);
            padding: rem(4px);
          }

          &.full-view {
            transform: rotate(45deg);
          }
        }
      }
    }

    .video-container {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;

      aspect-ratio: 4 / 3;
      border-radius: rem(10px);
      overflow: hidden;

      .placeholder,
      video {
        position: absolute;
        display: block;
        width: 100%;
        height: 100%;
        aspect-ratio: 4 / 3;
      }

      video {
        object-fit: cover;
        object-position: center;

        &::-webkit-media-controls-panel {
          display: none;
        }

        &:picture-in-picture {
          display: none;
        }
      }

      .pip-indicator {
        display: none;

        position: absolute;
        width: 100%;
        height: 100%;
        padding: rem(16px);
        align-items: center;
        justify-content: center;
        background-color: black;

        &:has(+ video:picture-in-picture) {
          display: flex;
        }
      }

      .placeholder {
        display: flex;
        place-items: center;
        place-content: center;
        padding-bottom: rem(8px);

        @each $color in map-get-req($config, profile-picture-colors) {
          &[data-color='#{$color}'] {
            color: var(--c-profile-picture-initials-#{$color}, default);
            background-color: var(--c-profile-picture-background-#{$color}, default);
          }
        }
      }
    }

    .video-container.pocket {
      width: 100%;
      height: 100%;
      border-radius: rem(24px);
      overflow: hidden;
      aspect-ratio: 1 / 1;

      video {
        aspect-ratio: 1 / 1;
      }
    }

    &[data-video-capture='off'],
    &[data-video-health='stalled'][data-type='localVideo'],
    &[data-video-health='stalled'][data-type='remoteVideo'] {
      video {
        visibility: hidden;
      }
    }

    .footer {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: rem(8px);

      position: absolute;
      bottom: 0;
      width: 100%;
      padding: rem(8px);

      .pills {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        justify-content: center;
        gap: rem(4px);

        .pill {
          display: flex;
          flex-direction: row;
          align-items: stretch;
          justify-content: center;

          padding: rem(4px) rem(8px);
          border-radius: rem(13px);
          color: white;
          background-color: rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(10px);

          &.control {
            font-size: rem(18px);
            padding: rem(4px);
          }
        }

        &.left {
          flex: 0 1 auto;
          min-width: 0;

          .pill {
            flex: 0 1 auto;
            min-width: 0;
          }
        }

        &.right {
          flex: 0 0 auto;

          .pill {
            flex: 0 0 auto;
          }
        }
      }
    }

    &[data-layout='regular'] {
      height: 100%;

      &[data-type='localScreen'] .video-container video,
      &[data-type='remoteScreen'] .video-container video {
        object-fit: contain;
      }
    }

    &[data-type='localVideo'] {
      video {
        transform: scale(-1, 1);

        &:picture-in-picture {
          transform: unset;
        }
      }
    }

    &[data-video-capture='on']:hover {
      .header {
        opacity: 1;
      }
    }
  }
</style>
