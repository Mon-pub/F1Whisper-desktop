<script lang="ts">
  import type {WaveformSliderProps} from '~/app/ui/components/atoms/waveform-slider/props';

  const {
    disabled = false,
    max,
    min,
    step,
    onafterslidermoved,
    onbeforeslidermoves,
    oninput,
    value = $bindable(),
    waveformData,
  }: WaveformSliderProps = $props();

  const percent = $derived(max === min ? 0 : ((value - min) / (max - min)) * 100);

  const maxAmplitude = $derived(Math.max(...waveformData));
</script>

<div class="container">
  {#if waveformData.length === 0}
    <!-- Display solid bar when waveform data is not available. -->
    <div class="solid-bar" class:highlighted={percent > 0}>
      <div class="progress" style:width={`${percent}%`}></div>
    </div>
  {:else}
    <div class="bars">
      {#each waveformData as rms, index (index)}
        <div
          class="bar"
          style:height={`${maxAmplitude === 0 ? 0 : (rms / maxAmplitude) * 100}%`}
          class:highlighted={(index / waveformData.length) * 100 < percent}
        ></div>
      {/each}
    </div>
  {/if}
  <input
    class="slider"
    type="range"
    {disabled}
    {min}
    {max}
    {step}
    {value}
    {oninput}
    onmousedown={onbeforeslidermoves}
    onmouseup={onafterslidermoved}
  />
</div>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-knob-size, --c-knob-border-width, --c-bar-width, --c-bar-margin);

  // Knob dimensions
  $-knob-size: rem(16px);
  $-knob-border-width: rem(2px);

  // Bar dimensions
  $-bar-width: rem(194px);
  $-bar-margin: calc((#{$-knob-size} + 2 * #{$-knob-border-width}) / 2);

  .container {
    @include def-var($-temp-vars, --c-knob-size, $-knob-size);
    @include def-var($-temp-vars, --c-knob-border-width, $-knob-border-width);
    @include def-var($-temp-vars, --c-bar-width, $-bar-width);
    @include def-var($-temp-vars, --c-bar-margin, $-bar-margin);

    position: relative;
    height: 100%;
    display: grid;
    align-items: center;
    justify-content: center;

    .solid-bar {
      grid-area: 1 / 1;

      display: flex;
      align-items: center;
      height: rem(2px);
      width: var($-temp-vars, --c-bar-width);
      margin-inline: var($-temp-vars, --c-bar-margin);
      box-sizing: border-box;
      background-color: var(--mc-message-audio-slider-neutral-color);
      border-radius: rem(1px);
      pointer-events: none;
      overflow: hidden;

      .progress {
        height: 100%;
        background-color: var(--t-color-primary);
        border-radius: rem(1px);
        transition: width 0.1s;
      }
    }

    .bars {
      grid-area: 1 / 1;

      display: flex;
      align-items: center;
      height: 100%;
      width: var($-temp-vars, --c-bar-width);
      margin-inline: var($-temp-vars, --c-bar-margin);
      box-sizing: border-box;
      gap: rem(2px);
      pointer-events: none;

      .bar {
        width: rem(2px);
        border-radius: rem(1px);
        background-color: var(--mc-message-audio-slider-neutral-color);
        transition: background-color 0.1s;

        transform-origin: center;
        transform: scaleY(0);

        animation: grow 0.8s var(--t-spring-animation-easing) forwards;

        // Keep consistent with `MAX_WAVES`.
        @for $i from 1 through 48 {
          &:nth-child(#{$i}) {
            animation-delay: 5ms * $i;
          }
        }

        @keyframes grow {
          to {
            transform: scaleY(1);
          }
        }

        &.highlighted {
          background-color: var(--t-color-primary);
        }
      }
    }

    .slider {
      grid-area: 1 / 1;
      z-index: 1;

      width: 100%;
      height: 0;
      appearance: none;
      border-radius: rem(2px);
      outline: none;
      margin: 0;

      &::-webkit-slider-thumb {
        width: var($-temp-vars, --c-knob-size);
        height: var($-temp-vars, --c-knob-size);
        appearance: none;
        background: white;
        border: var($-temp-vars, --c-knob-border-width) solid var(--t-color-primary);
        border-radius: 50%;
        cursor: pointer;
      }

      &:disabled::-webkit-slider-thumb {
        border: var($-temp-vars, --c-knob-border-width) solid
          var(--mc-slider-thumb-color-off--disabled);
        cursor: default;
      }
    }
  }
</style>
