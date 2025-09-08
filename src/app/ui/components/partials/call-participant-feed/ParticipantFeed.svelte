<!--
  @component Renders the participant feed (microphone / camera / shared screen) of a single receiver.
-->
<script lang="ts">
  import {onDestroy, untrack} from 'svelte';

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
    container: scrollContainer,
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

  /**
   * Options for `use:intersection`.
   */
  const intersectionObserverOptions = $derived({
    root: scrollContainer,
    threshold: 0,
  });

  let videoElement = $state<SvelteNullableBinding<HTMLVideoElement>>(null);

  /**
   * Current height of the container element.
   */
  let containerHeight = $state<Dimensions['height'] | undefined>(undefined);

  /**
   * Current width of the container element.
   */
  let containerWidth = $state<Dimensions['width'] | undefined>(undefined);

  /**
   * Whether the container element is currently in the visible area of the parent `scrollContainer`.
   */
  let containerVisibility = $state<boolean | undefined>(undefined);

  /**
   * Current height of the fullscreen area, or `undefined` if fullscreen is not active.
   */
  let fullscreenHeight = $state<Dimensions['height'] | undefined>(undefined);

  /**
   * Current width of the fullscreen area, or `undefined` if fullscreen is not active.
   */
  let fullscreenWidth = $state<Dimensions['width'] | undefined>(undefined);

  /**
   * Whether the feed is currently being displayed in fullscreen mode.
   */
  let fullscreenVisibility = $state<boolean>(false);

  /**
   * Current height of the picture-in-picture window, or `undefined` if picture-in-picture is not
   * active.
   */
  let pictureInPictureHeight = $state<Dimensions['height'] | undefined>(undefined);

  /**
   * Current width of the picture-in-picture window, or `undefined` if picture-in-picture is not
   * active.
   */
  let pictureInPictureWidth = $state<Dimensions['width'] | undefined>(undefined);

  /**
   * Whether the feed is currently being displayed in picture-in-picture mode.
   */
  let pictureInPictureVisibility = $state<boolean>(false);

  /**
   * Current height value to use for the subscription, or `undefined` if the video should not be
   * subscribed (e.g. if this element is currently not in the viewport).
   */
  const subscriptionHeight = $derived.by(() => {
    if (pictureInPictureVisibility) {
      return pictureInPictureHeight;
    }
    if (fullscreenVisibility) {
      return fullscreenHeight;
    }
    if (isFullView) {
      return containerHeight;
    }
    if (containerVisibility === true) {
      return containerHeight;
    }

    return undefined;
  });

  /**
   * Current width value to use for the subscription, or `undefined` if the video should not be
   * subscribed (e.g. if this element is currently not in the viewport).
   */
  const subscriptionWidth = $derived.by(() => {
    if (pictureInPictureVisibility) {
      return pictureInPictureWidth;
    }
    if (fullscreenVisibility) {
      return fullscreenWidth;
    }
    if (isFullView) {
      return containerWidth;
    }
    if (containerVisibility === true) {
      return containerWidth;
    }

    return undefined;
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

    containerHeight = Math.round(entry.contentRect.height);
    containerWidth = Math.round(entry.contentRect.width);
  }

  function handleChangeIntersection(event: CustomEvent<IntersectionEventDetail>): void {
    containerVisibility = event.detail.entry.isIntersecting;
  }

  function handleClickFullscreen(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (isFullscreen()) {
      exitFullscreen();
      return;
    }

    if (
      videoElement !== null &&
      document.fullscreenEnabled &&
      (capture.camera.state === 'on' || capture.screen.state === 'on')
    ) {
      if (Number.isNaN(videoElement.duration)) {
        videoElement.addEventListener('loadedmetadata', () => enterFullscreen(videoElement), {
          once: true,
        });
      } else {
        enterFullscreen(videoElement);
      }
    }
  }

  function handleChangeFullscreen(event: Event): void {
    // Return early if `event.target` is not a valid `HTMLVideoElement`.
    //
    // TODO(DESK-1931): Amend this if the `event.target` might be something other than a
    // `HTMLVideoElement`.
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    if (isFullscreen()) {
      fullscreenHeight = window.screen.height;
      fullscreenWidth = window.screen.width;
      fullscreenVisibility = true;
    } else {
      fullscreenVisibility = false;
      fullscreenHeight = undefined;
      fullscreenWidth = undefined;
    }
  }

  function handleClickPictureInPicture(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (document.pictureInPictureElement === videoElement) {
      exitPictureInPicture();
      return;
    }

    if (
      videoElement !== null &&
      document.pictureInPictureEnabled &&
      (capture.camera.state === 'on' || capture.screen.state === 'on')
    ) {
      if (Number.isNaN(videoElement.duration)) {
        videoElement.addEventListener('loadedmetadata', () => enterPictureInPicture(videoElement), {
          once: true,
        });
      } else {
        enterPictureInPicture(videoElement);
      }
    }
  }

  function handleChangePictureInPicture(event: PictureInPictureEvent): void {
    // Return early if target of the `PictureInPictureEvent` event is not a valid
    // `HTMLVideoElement`.
    //
    // TODO(DESK-1931): Amend this if the `event.target` might be something other than a
    // `HTMLVideoElement`.
    if (!(event.target instanceof HTMLVideoElement)) {
      return;
    }

    if (isPictureInPicture()) {
      // Update initial picture-in-picture dimensions & visibility.
      pictureInPictureHeight = Math.round(event.pictureInPictureWindow.height);
      pictureInPictureWidth = Math.round(event.pictureInPictureWindow.width);
      pictureInPictureVisibility = true;

      // Register `resize` listener on the `pictureInPictureWindow` to update dimensions while the
      // mode is active.
      event.pictureInPictureWindow.addEventListener('resize', handleResizePictureInPicture);
    } else {
      // Remove `resize` listener from the `pictureInPictureWindow`.
      event.pictureInPictureWindow.removeEventListener('resize', handleResizePictureInPicture);

      // Unset picture-in-picture dimensions & visibility.
      pictureInPictureVisibility = false;
      pictureInPictureHeight = undefined;
      pictureInPictureWidth = undefined;
    }
  }

  function handleResizePictureInPicture(event: Event): void {
    // Return early if target of the `PictureInPictureEvent` event is not a valid
    // `PictureInPictureWindow`.
    if (!(event.target instanceof PictureInPictureWindow)) {
      return;
    }

    pictureInPictureHeight = Math.round(event.target.height);
    pictureInPictureWidth = Math.round(event.target.width);
  }

  function isFullscreen(): boolean {
    // TODO(DESK-1931): Amend this if the fullscreen element might be something other than a
    // `HTMLVideoElement`.
    return document.fullscreenElement === videoElement;
  }

  function isPictureInPicture(): boolean {
    // TODO(DESK-1931): Amend this if the picture-in-picture element might be something other than a
    // `HTMLVideoElement`.
    return document.pictureInPictureElement === videoElement;
  }

  function enterFullscreen(element: SvelteNullableBinding<HTMLVideoElement>): void {
    if (isFullscreen()) {
      return;
    }

    element?.requestFullscreen().catch((error) => {
      log.warn('Entering fullscreen failed', error);
    });
  }

  function exitFullscreen(): void {
    if (!isFullscreen()) {
      return;
    }

    document.exitFullscreen().catch((error) => {
      log.warn('Exiting fullscreen failed', error);
    });
  }

  function enterPictureInPicture(element: SvelteNullableBinding<HTMLVideoElement>): void {
    if (isPictureInPicture()) {
      return;
    }

    element?.requestPictureInPicture().catch((error) => {
      log.warn('Entering picture-in-picture failed', error);
    });
  }

  function exitPictureInPicture(): void {
    if (!isPictureInPicture()) {
      return;
    }

    document.exitPictureInPicture().catch((error) => {
      log.warn('Exiting picture-in-picture failed', error);
    });
  }

  function addVideoElementEventListeners(element: SvelteNullableBinding<HTMLVideoElement>): void {
    if (element === null) {
      return;
    }

    element.addEventListener('fullscreenchange', handleChangeFullscreen);
    element.addEventListener('enterpictureinpicture', handleChangePictureInPicture);
    element.addEventListener('leavepictureinpicture', handleChangePictureInPicture);
  }

  function removeVideoElementEventListeners(
    element: SvelteNullableBinding<HTMLVideoElement>,
  ): void {
    if (element === null) {
      return;
    }

    element.removeEventListener('fullscreenchange', handleChangeFullscreen);
    element.removeEventListener('enterpictureinpicture', handleChangePictureInPicture);
    element.removeEventListener('leavepictureinpicture', handleChangePictureInPicture);
  }

  // Update video track.
  let currentTrack: MediaStreamTrack | undefined = undefined;
  $effect(() => {
    if (videoElement === null) {
      currentTrack = undefined;
      return;
    }

    const newTrack =
      tracks.type === 'localScreen' || tracks.type === 'remoteScreen'
        ? tracks.screen
        : tracks.camera;

    if (newTrack === undefined) {
      // Remove track from video element, as it's now `undefined`.
      videoElement.srcObject = null;
    } else if (videoElement.srcObject === null || currentTrack !== newTrack) {
      // Assign new track, as none is assigned yet or it has actually changed.
      videoElement.srcObject = new MediaStream([newTrack]);
    }

    currentTrack = newTrack;
  });

  // Track video stream health.
  let unsubscribeVideoHealth: (() => void) | undefined = $state();
  let videoHealth: 'good' | 'stalled' | 'unknown' = $state('unknown');
  function videoHealthStalledHandler(): void {
    videoHealth = 'stalled';
  }
  function videoHealthGoodHandler(): void {
    videoHealth = 'good';
  }
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

  // Update subscriptions.
  $effect(() => {
    let dimensions: Dimensions | undefined = undefined;
    if (subscriptionHeight !== undefined && subscriptionWidth !== undefined) {
      dimensions = {
        height: subscriptionHeight,
        width: subscriptionWidth,
      };
    }

    switch (type) {
      case 'localVideo':
      case 'remoteVideo':
        return updateCameraSubscription(dimensions);

      case 'localScreen':
      case 'remoteScreen':
        return updateScreenSubscription(dimensions);

      default:
        return unreachable(type);
    }
  });

  let previousVideoElement = $state<SvelteNullableBinding<HTMLVideoElement>>(null);
  $effect(() => {
    untrack(() => removeVideoElementEventListeners(previousVideoElement));
    addVideoElementEventListeners(videoElement);

    untrack(() => {
      previousVideoElement = videoElement;
    });
  });

  onDestroy(() => {
    // Close picture-in-picture and fullscreen, if active.
    if (isPictureInPicture()) {
      exitPictureInPicture();
    }
    if (isFullscreen()) {
      exitFullscreen();
    }

    removeVideoElementEventListeners(videoElement);
    unsubscribeVideoHealth?.();
  });
</script>

<div
  use:size
  use:intersection={{options: intersectionObserverOptions}}
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
  onintersectionenter={handleChangeIntersection}
  onintersectionexit={handleChangeIntersection}
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
          {#snippet children(tooltip)}
            <button
              class="action full-view"
              onclick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                tooltip?.close();
                onclicktogglefullview?.(event);
              }}
            >
              {#if isFullView}
                <MdIcon theme="Filled">unfold_less</MdIcon>
              {:else}
                <MdIcon theme="Filled">unfold_more</MdIcon>
              {/if}
            </button>
          {/snippet}
        </Hint>

        <Hint
          icon="info"
          id="participant-feed-fullscreen-tooltip"
          position="bottom"
          text={$i18n.t('messaging.label--call-video-fullscreen', 'Full screen')}
        >
          {#snippet children(tooltip)}
            <button
              class="action"
              onclick={(event) => {
                tooltip?.close();
                handleClickFullscreen(event);
              }}
            >
              <MdIcon theme="Filled">fit_screen</MdIcon>
            </button>
          {/snippet}
        </Hint>

        <Hint
          icon="info"
          id="participant-feed-pip-tooltip"
          position="bottom"
          text={$i18n.t('messaging.label--call-video-pip', 'Picture-in-Picture')}
        >
          {#snippet children(tooltip)}
            <button
              class="action"
              onclick={(event) => {
                tooltip?.close();
                handleClickPictureInPicture(event);
              }}
            >
              <MdIcon theme="Filled">open_in_new</MdIcon>
            </button>
          {/snippet}
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
      pointer-events: none;
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
        pointer-events: none;

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
        pointer-events: unset;
      }
    }
  }

  .container > .header > .actions > :global(div):has(.action.full-view) {
    display: none;
  }

  @media (min-width: 768px) {
    .container > .header > .actions > :global(div):has(.action.full-view) {
      display: block;
    }
  }
</style>
