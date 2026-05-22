<!--
  @component Renders an audio recorder.
-->

<script lang="ts">
  import {ensureError} from '@threema/ts-utils/meta/ensure-error';
  import {onDestroy, onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import {
    getDefaultMicrophone,
    getFirstMicrophone,
  } from '~/app/ui/components/molecules/audio-recorder/helpers';
  import Waveform from '~/app/ui/components/molecules/audio-recorder/internal/waveform/Waveform.svelte';
  import type {AudioRecorderProps} from '~/app/ui/components/molecules/audio-recorder/props';
  import type {PlaybackState} from '~/app/ui/components/molecules/audio-recorder/types';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {ensureU53} from '~/common/types';
  import {unreachable} from '~/common/utils/assert';
  import type {SendFileBasedMessageInformation} from '~/common/viewmodel/conversation/main/controller/types';

  const {onerror}: AudioRecorderProps = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.audio-recorder');

  const mimeType = 'audio/webm;codecs=opus';
  const audioBitsPerSecond = 64_000;
  const timeslice = 100;

  // Recording
  let mediaRecorder = $state<MediaRecorder | undefined>(undefined);
  let mediaStream = $state<MediaStream | undefined>(undefined);
  let mediaTrack = $state<MediaStreamTrack | undefined>(undefined);
  let recordingState = $state<RecordingState>('inactive');
  let chunks: Blob[] = [];
  let duration = 0;

  // Playback
  let mediaPlayer = $state<HTMLAudioElement | undefined>(undefined);
  let playbackState = $state<PlaybackState>('inactive');
  let audioUrl: string | undefined = undefined;

  /**
   * Get the recorded voice message.
   *
   * Recording will be stopped, and the media type is ‘audio/ogg’.
   */
  export async function getRecordedAudio(): Promise<SendFileBasedMessageInformation | undefined> {
    stopRecording();
    const blob = new Blob(chunks, {type: mimeType});

    if (blob.size > 0) {
      const files: SendFileBasedMessageInformation['files'] = [];
      const createdAt = new Date().getTime();

      files.push({
        bytes: new Uint8Array(await blob.arrayBuffer()),
        fileName: `voice-message-${createdAt}.m4a`,
        fileSize: ensureU53(blob.size),
        mediaType: blob.type,
        sendAsFile: false,
        duration: duration / 1000,
      });

      return {
        type: 'files',
        files,
      };
    }
    return undefined;
  }

  async function startRecording(): Promise<void> {
    const microphone = (await getDefaultMicrophone()) ?? (await getFirstMicrophone());

    if (microphone === undefined) {
      log.warn('No microphone available, voice message recording is not possible');
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {deviceId: microphone.deviceId, channelCount: 1},
      });

      mediaTrack = mediaStream.getAudioTracks()[0];
      mediaRecorder = new MediaRecorder(mediaStream, {mimeType, audioBitsPerSecond});

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        chunks.push(event.data);
        duration += timeslice;
      };

      mediaRecorder.onstart = () => {
        recordingState = 'recording';
        log.debug('Voice recording started');
      };

      mediaRecorder.onpause = () => {
        if (mediaTrack !== undefined) {
          mediaTrack.enabled = false;
        }
        recordingState = 'paused';
        log.debug('Voice recording paused');
      };

      mediaRecorder.onresume = () => {
        if (mediaTrack !== undefined) {
          mediaTrack.enabled = true;
        }
        recordingState = 'recording';
        log.debug('Voice recording resumed');
      };

      mediaRecorder.onstop = () => {
        recordingState = 'inactive';
        log.debug('Voice recording stopped');
      };

      mediaRecorder.onerror = (error) => {
        recordingState = 'inactive';
        log.warn('Voice recorder error: ', ensureError(error));
      };

      mediaRecorder.start(timeslice);
    } catch (error: unknown) {
      const error_ = ensureError(error);
      log.error('Failed to access microphone device: ', error_);
      onerror?.(error_);
    }
  }

  function stopRecording(): void {
    mediaRecorder?.stop();

    if (mediaTrack !== undefined) {
      mediaTrack.stop();
      mediaTrack = undefined;
    }
  }

  function toggleRecording(): void {
    switch (recordingState) {
      case 'paused':
        mediaRecorder?.resume();
        break;

      case 'recording':
        mediaRecorder?.pause();
        break;

      default:
        log.warn(`MediaRecorder has invalid state ${recordingState}, abort toggle`);
        break;
    }
  }

  async function startPlayback(): Promise<void> {
    if (audioUrl !== undefined) {
      URL.revokeObjectURL(audioUrl);
    }

    const blob = new Blob(chunks, {type: mimeType});
    audioUrl = URL.createObjectURL(blob);

    mediaPlayer = new Audio(audioUrl);

    mediaPlayer.onplay = () => {
      playbackState = 'playing';
      log.debug('Playback started');
    };

    mediaPlayer.onpause = () => {
      playbackState = 'paused';
      log.debug('Playback paused');
    };

    mediaPlayer.onended = () => {
      playbackState = 'inactive';
      log.debug('Playback finished');
    };

    mediaPlayer.onerror = (error) => {
      log.warn('Playback error: ', ensureError(error));
    };

    await mediaPlayer.play();
  }

  function stopPlayback(): void {
    // There is no stop()
    mediaPlayer?.pause();
    playbackState = 'inactive';
    if (audioUrl !== undefined) {
      URL.revokeObjectURL(audioUrl);
    }
  }

  async function togglePlayback(): Promise<void> {
    switch (playbackState) {
      case 'paused':
        await mediaPlayer?.play();
        break;

      case 'playing':
        mediaPlayer?.pause();
        break;

      case 'inactive':
        await startPlayback();
        break;

      default:
        unreachable(playbackState);
    }
  }

  onMount(async () => {
    await startRecording();
  });

  onDestroy(async () => {
    stopPlayback();
    stopRecording();
    chunks = [];
  });
</script>

<div class="container">
  {#if recordingState === 'paused'}
    <IconButton flavor="naked" onclick={togglePlayback}>
      <MdIcon theme="Filled">{playbackState === 'playing' ? 'pause' : 'play_arrow'}</MdIcon>
    </IconButton>
  {:else}
    <div class="record">
      <MdIcon theme="Filled">circle</MdIcon>
    </div>
  {/if}

  <div class="waveform">
    {#if mediaStream !== undefined}
      <Waveform {mediaStream} isPaused={recordingState !== 'recording'}></Waveform>
    {/if}
  </div>

  <div>
    <IconButton flavor="naked" onclick={toggleRecording} disabled={playbackState === 'playing'}>
      <MdIcon theme="Filled">{recordingState === 'paused' ? 'mic' : 'pause'}</MdIcon>
    </IconButton>
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    height: 100%;
    display: flex;
    align-items: center;
    gap: rem(8px);
    overflow: hidden;

    .record {
      display: grid;
      place-items: center;
      color: red;
      padding: rem(10px);
      font-size: rem(20px);
      animation: blinker 2s linear infinite;
    }

    .waveform {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    @keyframes blinker {
      50% {
        opacity: 0.5;
      }
    }
  }
</style>
