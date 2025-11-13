<script lang="ts">
  import {onDestroy, onMount} from 'svelte';

  import type {WaveformProps} from '~/app/ui/components/molecules/audio-recorder/internal/waveform/props';

  const {mediaStream, isPaused}: WaveformProps = $props();

  // The number of bars (amplitudes) in the waveform.
  const WAVEFORM_RESOLUTION = 128;

  // Update animation every nth frame (1 == fastest).
  const WAVEFORM_ANIMATION_SPEED = 1;

  // Initial max amplitude in the range of [0, 1].
  const WAVEFORM_INITIAL_SENSITIVITY = 0.1;

  // Min bar height in pixel.
  const WAVEFORM_MIN_HEIGHT_PIXEL = 4;

  // Max bar height percentage of the container's height.
  const WAVEFORM_MAX_HEIGHT_FACTOR = 0.8;

  const audioContext = new AudioContext();
  const analyserNode = audioContext.createAnalyser();
  // Set the size of the Fast Fourier Transform.
  analyserNode.fftSize = 2048;
  const dataArray = new Float32Array(analyserNode.frequencyBinCount);
  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(analyserNode);

  let animationFrame = 0;
  let maxAmplitude = WAVEFORM_INITIAL_SENSITIVITY;
  let amplitudes = $state(Array(WAVEFORM_RESOLUTION).fill(0));
  let waveformWidth = $state(0);
  let waveformHeight = $state(0);

  function update(): void {
    // Get the audio data from the analyserNode (time-domain data).
    analyserNode.getFloatTimeDomainData(dataArray);

    // Calculate the RMS (root mean square) of the audio signal.
    // This is a measure of the signal's loudness.
    const sum = dataArray.reduce((acc, value) => acc + value * value, 0);
    const rms = Math.sqrt(sum / (dataArray.byteLength / 4));

    // Update max amplitude for scaling.
    if (rms > maxAmplitude) {
      maxAmplitude = rms;
    }

    // Normalize RMS to the range [0, 1] based on maxAmplitude.
    const normalizedRms = rms / maxAmplitude;

    // Shift the array (every nth frame, for animation purposes) and add the new RMS value.
    if (animationFrame % WAVEFORM_ANIMATION_SPEED === 0 && !isPaused) {
      amplitudes = [...amplitudes.slice(1), normalizedRms];
    }

    animationFrame = requestAnimationFrame(update);
  }

  onMount(async () => {
    update();
  });

  onDestroy(async () => {
    cancelAnimationFrame(animationFrame);
    await audioContext.close();
  });
</script>

<div class="container" bind:clientWidth={waveformWidth} bind:clientHeight={waveformHeight}>
  {#each amplitudes as amp, index (index)}
    <div
      class="bar"
      style:height="{WAVEFORM_MIN_HEIGHT_PIXEL +
        amp * waveformHeight * WAVEFORM_MAX_HEIGHT_FACTOR}px"
    ></div>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    position: absolute;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 100%;
    width: 100%;
    min-width: rem(1024px);
    gap: rem(2px);

    .bar {
      width: 0;
      flex-grow: 1;
      background-color: var(--t-text-e2-color);
      border-radius: rem(2px);
    }
  }
</style>
