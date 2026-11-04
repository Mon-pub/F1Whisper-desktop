<!--
  @component Renders an audio player.
-->
<script lang="ts" module>
</script>

<script lang="ts">
  import {ensureArrayBufferBackedView} from '@threema/ts-utils/byte/array-buffer-backed-view';
  import type {f64} from '@threema/ts-utils/float/f64';
  import {ensureError} from '@threema/ts-utils/meta/ensure-error';
  import {onDestroy} from 'svelte';

  import {globals} from '~/app/globals';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import WaveformSilder from '~/app/ui/components/atoms/waveform-slider/WaveformSilder.svelte';
  import {
    cyclePlaybackSpeed,
    getAudioPlaybackController,
    isListenOncePlaybackLocked,
    type PlaybackSpeed,
  } from '~/app/ui/components/molecules/audio-player/controller';
  import type {AudioPlayerProps} from '~/app/ui/components/molecules/audio-player/props';
  import type {LazyAudioContent} from '~/app/ui/components/molecules/audio-player/types';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {reactive} from '~/app/ui/utils/svelte';
  import {assertUnreachable} from '~/common/utils/assert';
  import {calculateRootMeanSquare} from '~/common/utils/audio';

  const log = globals.unwrap().uiLogging.logger('ui.component.audio-player');

  // The maximum number of waves. This is tuned to the message width.
  const MAX_WAVES = 48;

  // Thresholds for skipping waveform calculation.
  const MAX_WAVEFORM_AUDIO_DURATION = 600; // 10 minutes in seconds
  const MAX_WAVEFORM_AUDIO_FILE_SIZE = 8_388_608; // 8 MB in bytes

  const {audioFile, playbackId, onlistenoncecomplete, snippetFooter}: AudioPlayerProps = $props();

  // Playback is owned by an app-scoped controller (not the component), so it survives conversation
  // switches, which unmount and destroy every per-message player component. This component is a view
  // over that controller: it renders the shared playback state for the message it represents and
  // issues commands. Regular audio survives this component unmounting; listen-once playback is
  // explicitly abandoned and consumed so it cannot continue invisibly outside its conversation.
  const controller = getAudioPlaybackController();
  const playback = controller.state;

  // Whether THIS message is the one currently loaded into the shared playback element.
  const isActive = $derived($playback.activeId === playbackId);

  // Listen-once voice message state (F1Whisper fork). The badge communicates that the message plays
  // once; when an inbound listen-once finishes playing, it is burned (`onlistenoncecomplete`).
  const isListenOnce = $derived(audioFile.listenOnce === true);
  const isListenOnceConsumed = $derived(audioFile.listenOnceConsumed === true);
  // A consumed listen-once message is "burned": its blob is gone, so playback is disabled.
  const burned = $derived(isListenOnce && isListenOnceConsumed);

  // FU-M05 (listen-once local hardening): a not-yet-consumed listen-once voice message may only be
  // played through an entry point that will actually consume (burn) it. When no consume callback is
  // wired (e.g. the search-result preview list), playback is LOCKED here so the message can never be
  // heard without being burned. This is the single choke point that covers every playback entry
  // point.
  const playbackLocked = $derived(
    isListenOncePlaybackLocked({
      listenOnce: isListenOnce,
      listenOnceConsumed: isListenOnceConsumed,
      hasConsumeCallback: onlistenoncecomplete !== undefined,
    }),
  );

  // Desired playback speed for this message. When active, the controller is the source of truth (so
  // a re-mounted view of a still-playing message shows the live speed); otherwise this local desired
  // speed is used and handed to the controller on the next play.
  let localPlaybackSpeed = $state<PlaybackSpeed>(1);
  const playbackSpeed = $derived<PlaybackSpeed>(
    isActive ? $playback.playbackSpeed : localPlaybackSpeed,
  );

  // Whether playback is paused. A message that is not the active one always reads as paused.
  const isPaused = $derived(!isActive || $playback.paused);

  // Slider position, in seconds. For the active message it follows the shared playback position; for
  // a not-yet-played message it holds the last scrubbed position, applied when playback starts.
  let localScrubPosition = $state<f64>(0);
  const currentSliderPosition = $derived(isActive ? $playback.currentTime : localScrubPosition);

  const duration = $derived<f64>(audioFile.duration ?? 0);
  // Prefer the controller's measured duration once known (message metadata can be missing/wrong).
  const sliderMax = $derived(isActive && $playback.duration > 0 ? $playback.duration : duration);

  /**
   * Store containing the audio fetch state.
   */
  let audio = $state<LazyAudioContent>({state: 'loading'});

  let waveformData = $state<readonly f64[]>([]);

  async function loadAudio(): Promise<void> {
    // Defense-in-depth (F1Whisper fork): a burned listen-once message has no blob, so never attempt
    // to fetch it (the model-side `blob()` guard would throw). With the Message.svelte collapse this
    // player won't even mount for a burned message; this keeps the player safe if it ever does.
    //
    // FU-M05: a LOCKED listen-once (no consume callback, e.g. in search previews) must not have its
    // bytes fetched/decoded at all, so a message that cannot be burned here never lingers in memory.
    if (burned || playbackLocked) {
      audio = {state: 'failed'};
      return;
    }

    const fileInformation = await audioFile.fetchFileBytes().catch((error) => {
      log.debug(
        'Loading the audio bytes failed, either there was an error or the upload is not yet done',
        ensureError(error),
      );
      return undefined;
    });

    if (fileInformation === undefined) {
      audio = {state: 'failed'};
      return;
    }

    if (!fileInformation.mediaType.startsWith('audio/')) {
      log.warn(`The loaded file is of type audio but of ${fileInformation.mediaType}`);
      audio = {state: 'failed'};
      return;
    }

    const audioBlob = new Blob([ensureArrayBufferBackedView(fileInformation.bytes)], {
      type: fileInformation.mediaType,
    });
    audio = {
      state: 'loaded',
      blob: audioBlob,
    };

    // Skip waveform calculation if audio file is either too long or too large. Skips expensive
    // waveform calculation, which might even crash the renderer process.
    if (
      duration > MAX_WAVEFORM_AUDIO_DURATION ||
      audioFile.sizeInBytes > MAX_WAVEFORM_AUDIO_FILE_SIZE
    ) {
      log.debug(
        `Skipping waveform calculation for audio file (duration: ${duration}s, size: ${audioFile.sizeInBytes} bytes)`,
      );
      waveformData = [];
    } else {
      // Non-blocking calculation of RMS.
      calculateRootMeanSquare(audioBlob, MAX_WAVES, log)
        .then((result) => {
          waveformData = result ?? [];
        })
        .catch(assertUnreachable);
    }
  }

  /**
   * Handle play / pause button click.
   */
  function handleClickButton(): void {
    if (audio.state !== 'loaded') {
      return;
    }
    controller
      .toggle({
        id: playbackId,
        blob: audio.blob,
        durationHint: duration,
        startPositionSeconds: isActive || localScrubPosition <= 0 ? undefined : localScrubPosition,
        playbackSpeed,
        isListenOnce,
        // Only an inbound, not-yet-consumed listen-once message may be burned. Once playback starts,
        // reaching the end or abandoning/replacing/stopping it finalizes the one permitted session.
        onListenOnceConsumed:
          isListenOnce && !isListenOnceConsumed ? onlistenoncecomplete : undefined,
      })
      .catch(assertUnreachable);
  }

  function handleClickCirclePlayBackSpeed(currentPlaybackSpeed: PlaybackSpeed): void {
    const nextPlaybackSpeed = cyclePlaybackSpeed(currentPlaybackSpeed);
    localPlaybackSpeed = nextPlaybackSpeed;
    // No-op unless this message is active; the new speed is otherwise applied on the next play.
    controller.setSpeed(playbackId, nextPlaybackSpeed);
  }

  function pauseAudio(): void {
    controller.beginScrub(playbackId);
  }

  function restartAudio(): void {
    controller.endScrub(playbackId);
  }

  function onSliderMoved(event: Event): void {
    const target = event.target;
    if (target === null) {
      return;
    }

    // Usage of `in` is necessary here because property 'value' is not owned. Because the key is
    // hardcoded, unexpected property access is not possible.
    //
    // eslint-disable-next-line no-restricted-syntax
    if ('value' in target && typeof target.value === 'string') {
      const newPosition = parseFloat(target.value);
      if (!isNaN(newPosition)) {
        if (isActive) {
          controller.seek(playbackId, newPosition);
        } else {
          localScrubPosition = newPosition;
        }
      }
    }
  }

  $effect(() => {
    reactive(() => {
      loadAudio().catch(assertUnreachable);
    }, [audioFile]);
  });

  onDestroy(() => {
    controller.abandon(playbackId);
  });
</script>

<div
  class="audio-player"
  class:footer={snippetFooter !== undefined}
  class:listen-once-consumed={isListenOnce && isListenOnceConsumed}
>
  <button
    class="toggle"
    disabled={audio.state === 'failed' || burned || playbackLocked}
    onclick={handleClickButton}
    title={playbackLocked
      ? $i18n.t('messaging.hint--listen-once-open-chat', 'Open the chat to listen')
      : undefined}
  >
    {#if burned}
      <MdIcon theme="Filled">timer_off</MdIcon>
    {:else if playbackLocked}
      <MdIcon theme="Filled">timer</MdIcon>
    {:else if audio.state === 'loaded'}
      {#if isPaused}
        <MdIcon theme="Filled">play_arrow</MdIcon>
      {:else}
        <MdIcon theme="Filled">pause</MdIcon>
      {/if}
    {:else if audio.state === 'failed'}
      <MdIcon theme="Filled">close</MdIcon>
    {/if}
  </button>
  <span class="progress">
    <WaveformSilder
      disabled={audio.state === 'failed' || burned || playbackLocked}
      value={currentSliderPosition}
      min={0}
      max={sliderMax}
      step={0.1}
      oninput={onSliderMoved}
      onbeforeslidermoves={pauseAudio}
      onafterslidermoved={restartAudio}
      {waveformData}
    />
  </span>
  {#if isListenOnce}
    <span
      class="listen-once"
      title={isListenOnceConsumed
        ? $i18n.t('messaging.label--listen-once-consumed', 'Played once')
        : $i18n.t('messaging.label--listen-once', 'Plays once')}
    >
      <MdIcon theme="Filled">{isListenOnceConsumed ? 'timer_off' : 'timer'}</MdIcon>
      <Text color="mono-low" family="secondary" size="body-small" text="1" wrap={false}></Text>
    </span>
  {:else}
    <button
      class="speed"
      disabled={audio.state === 'failed'}
      onclick={() => handleClickCirclePlayBackSpeed(playbackSpeed)}
    >
      <Text color="mono-low" family="secondary" text={`${playbackSpeed}x`}></Text>
    </button>
  {/if}
  {#if snippetFooter !== undefined}
    <span class="footer">
      {@render snippetFooter?.(currentSliderPosition > 0 ? currentSliderPosition : duration)}
    </span>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .audio-player {
    display: grid;
    grid-template:
      'toggle . progress . speed' auto
      / auto rem(12px) 1fr rem(2px) auto;
    place-items: center stretch;
    row-gap: rem(4px);
    width: 100%;
    padding-top: rem(12px);

    &.footer {
      grid-template:
        'toggle . progress . speed' auto
        '.      . footer   . .    ' auto
        / auto rem(12px) 1fr rem(2px) auto;
    }

    .toggle {
      grid-area: toggle;

      --c-icon-button-naked-outer-background-color--hover: transparent;
      --c-icon-button-naked-outer-background-color--focus: transparent;
      --c-icon-button-naked-outer-background-color--active: transparent;

      @include clicktarget-button-circle;

      & {
        display: flex;
        justify-content: center;
        align-items: center;
        color: var(--t-color-primary);
        background-color: transparent;
        border: rem(2px) solid var(--t-color-primary);
        width: rem(32px);
        height: rem(32px);
        font-size: rem(22px);
      }
    }

    .progress {
      grid-area: progress;

      display: flex;
      align-items: center;
      justify-content: stretch;
      height: 100%;
    }

    .speed {
      grid-area: speed;

      width: rem(42px);
      padding-block: rem(2px);
      border-radius: rem(11px);

      @include clicktarget-button-rect;
    }

    // Listen-once badge (F1Whisper fork): sits where the speed control would be, communicating that
    // the voice message plays a single time. Display-only.
    .listen-once {
      grid-area: speed;

      display: flex;
      align-items: center;
      gap: rem(2px);
      color: var(--t-color-primary);

      @include def-var(--c-icon-font-size, #{rem(20px)});
    }

    // Consumed (burned) listen-once message: the whole player is dimmed to signal it can no longer
    // be played.
    &.listen-once-consumed {
      opacity: 0.55;

      .listen-once {
        color: var(--mc-message-indicator-label);
      }
    }

    .footer {
      grid-area: footer;
      min-width: 100%;
    }
  }
</style>
