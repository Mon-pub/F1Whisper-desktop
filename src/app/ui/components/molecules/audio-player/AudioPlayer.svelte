<!--
  @component Renders an audio player.
-->
<script lang="ts" module>
  /**
   * States used to describe the progress when loading an audio source.
   */
  type BlobState =
    | {status: 'loading'}
    | {status: 'failed'}
    | {
        status: 'loaded';
        url: string;
      };
</script>

<script lang="ts">
  import {onDestroy} from 'svelte';

  import type {AudioPlayerProps} from '~/app/ui/components/molecules/audio-player/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import LinearProgress from '~/app/ui/svelte-components/blocks/LinearProgress/LinearProgress.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {f64} from '~/common/types';
  import {assert, assertUnreachable, ensureError} from '~/common/utils/assert';
  import {ResolvablePromise} from '~/common/utils/resolvable-promise';
  import {WritableStore} from '~/common/utils/store';

  const {
    duration: reportedDuration,
    fetchAudio,
    onerror,
    snippetFooter,
  }: AudioPlayerProps = $props();

  /**
   * The bound HTML `audio` element.
   */
  let audio = $state<SvelteNullableBinding<HTMLAudioElement>>(null);

  /**
   * Whether an audio track is currently loaded.
   */
  const isLoaded = new WritableStore<ResolvablePromise<void>>(
    new ResolvablePromise<void>({uncaught: 'default'}),
  );

  /**
   * Whether playback is paused.
   */
  let isPaused = $state(true);

  /**
   * Current position of playback, in seconds.
   */
  let currentPosition = $state<f64>(0);

  /**
   * Duration of the actual audio track, in seconds.
   */
  let realDuration = $state<f64 | undefined>(undefined);

  /**
   * Store containing the audio fetch state.
   */
  let blob = $state<BlobState>({status: 'loading'});

  /**
   * Handle play / pause button click.
   */
  function handleClickButton(): void {
    if (isLoaded.get().state.type === 'resolved') {
      togglePlayback().catch(assertUnreachable);
    } else {
      loadAndPlayAudio().catch(assertUnreachable);
    }
  }

  /**
   * Handle audio and metadata loaded event.
   */
  function handleLoadedMetadata(): void {
    resetPlayerState();
    isLoaded
      // eslint-disable-next-line @typescript-eslint/promise-function-async
      .update((value: ResolvablePromise<void>): ResolvablePromise<void> => {
        value.resolve();
        return value;
      })
      .catch(assertUnreachable);
  }

  /**
   * Handle audio time update event.
   */
  function handleTimeUpdate(): void {
    if (isLoaded.get().state.type !== 'resolved') {
      return;
    }

    currentPosition = audio?.currentTime ?? 0;
  }

  /**
   * Handle audio ended event.
   */
  function handleEnded(): void {
    isPaused = true;
  }

  /**
   * Reset player to its initial state.
   */
  function resetPlayerState(): void {
    isPaused = true;
    currentPosition = 0;
    realDuration = Number.isNaN(audio?.duration) ? undefined : audio?.duration;
  }

  /**
   * Start / stop playback of the audio.
   */
  async function togglePlayback(): Promise<void> {
    if (isLoaded.get().state.type !== 'resolved') {
      return;
    }

    if (audio?.paused === true) {
      // If we're at the end of the track, rewind first.
      if (currentPosition === duration) {
        rewind();
      }

      await audio.play();
    } else {
      audio?.pause();
    }

    isPaused = audio?.paused ?? true;
  }

  /**
   * Rewind the audio.
   */
  function rewind(): void {
    if (isLoaded.get().state.type !== 'resolved') {
      return;
    }

    audio?.load();
  }

  async function loadAudio(fetch: typeof fetchAudio): Promise<void> {
    isLoaded.set(new ResolvablePromise<void>({uncaught: 'default'})).catch(assertUnreachable);

    await fetch()
      .then((result) => {
        if (result === undefined) {
          throw new Error("Didn't receive any audio bytes");
        }

        return {
          status: 'loaded',
          url: URL.createObjectURL(new Blob([result.bytes], {type: result.mediaType})),
        } as const;
      })
      .then((state) => {
        // Release previous `objectURL`.
        if (blob.status === 'loaded') {
          URL.revokeObjectURL(blob.url);
        }

        blob = state;
      })
      .catch(() => {
        blob = {
          status: 'failed',
        };
      });
  }

  async function loadAndPlayAudio(): Promise<void> {
    await loadAudio(fetchAudio)
      .then(async () => {
        await isLoaded.get();
      })
      .then(async () => {
        assert(isLoaded.get().state.type === 'resolved', 'Expected audio to be loaded');
        await togglePlayback();
      })
      .catch((error: unknown) => {
        onerror(ensureError(error));
      });
  }

  const duration = $derived(realDuration ?? reportedDuration);

  onDestroy(() => {
    if (blob.status === 'loaded') {
      URL.revokeObjectURL(blob.url);
    }
  });
</script>

<div class="audio-player" class:footer={snippetFooter !== undefined}>
  <button class="toggle" onclick={handleClickButton}>
    {#if $isLoaded.state.type !== 'resolved'}
      <MdIcon theme="Filled">play_arrow</MdIcon>
    {:else if isPaused}
      <MdIcon theme="Filled">play_arrow</MdIcon>
    {:else}
      <MdIcon theme="Filled">pause</MdIcon>
    {/if}
  </button>
  <span class="progress">
    <LinearProgress
      value={$isLoaded.state.type === 'resolved' && duration !== undefined
        ? (currentPosition * 100) / duration
        : 0}
      variant="determinate"
    />
  </span>
  {#if snippetFooter !== undefined}
    <span class="footer">
      {@render snippetFooter?.(duration)}
    </span>
  {/if}
  {#if blob.status === 'loaded'}
    <audio
      bind:this={audio}
      src={blob.url}
      onerror={(event) => {
        onerror(new Error('Unknown error in audio element'));
      }}
      onloadedmetadata={handleLoadedMetadata}
      ontimeupdate={handleTimeUpdate}
      onended={handleEnded}
    ></audio>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .audio-player {
    display: grid;
    grid-template:
      'toggle progress' auto
      / auto 1fr;
    place-items: center stretch;
    gap: rem(8px);
    width: 100%;

    &.footer {
      grid-template:
        'toggle progress' auto
        '.      footer' auto
        / auto 1fr;
      row-gap: 0;
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
      min-width: rem(128px);
      width: 100%;
      height: rem(3px);
      border-radius: rem(1.5px);
      overflow: hidden;

      --c-linear-progress-transition: linear 0.25s;
    }

    .footer {
      grid-area: footer;
      min-width: 100%;
    }
  }
</style>
