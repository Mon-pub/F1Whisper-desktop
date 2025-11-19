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
  <div class="bars">
    {#each waveformData as rms, index (index)}
      <div
        class="bar"
        style:height={`${maxAmplitude === 0 ? 0 : (rms / maxAmplitude) * 100}%`}
        class:highlighted={(index / waveformData.length) * 100 < percent}
      ></div>
    {/each}
  </div>
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

  .container {
    position: relative;
    height: 100%;
    display: grid;
    align-items: center;
    justify-content: center;

    .bars {
      grid-area: 1 / 1;

      display: flex;
      align-items: center;
      height: 100%;
      width: rem(194px);
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
        width: rem(17px);
        height: rem(17px);
        appearance: none;
        background: white;
        border: rem(2px) solid var(--t-color-primary);
        border-radius: 50%;
        cursor: pointer;
      }

      &:disabled::-webkit-slider-thumb {
        border: rem(2px) solid var(--mc-slider-thumb-color-off--disabled);
        cursor: default;
      }
    }
  }
</style>
