<script lang="ts">
  import type {SliderProps} from '~/app/ui/components/atoms/slider/props';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {
    min,
    max,
    step,
    value,
    iconLeft,
    iconRight,
    oninput,
    onclickleft,
    onclickright,
  }: SliderProps = $props();

  let slider = $state<HTMLInputElement>();

  const percent = $derived(((value - min) / (max - min)) * 100);
</script>

<div class="container">
  {#if iconLeft !== undefined}
    <div class="control">
      <IconButton flavor="naked" onclick={onclickleft} disabled={value <= min}>
        <MdIcon theme="Outlined">{iconLeft}</MdIcon>
      </IconButton>
    </div>
  {/if}

  <input
    class="slider"
    type="range"
    {min}
    {max}
    {step}
    {value}
    {oninput}
    bind:this={slider}
    style:--c-t-slider-percentage={`${percent}%`}
  />

  {#if iconRight !== undefined}
    <div class="control">
      <IconButton flavor="naked" onclick={onclickright} disabled={value >= max}>
        <MdIcon theme="Outlined">{iconRight}</MdIcon>
      </IconButton>
    </div>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  $-vars: (slider-percentage);
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  .container {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: stretch;
    margin: rem(16px);

    .slider {
      flex: 1 1 auto;

      width: 100%;
      height: rem(8px);
      appearance: none;
      border-radius: rem(4px);
      outline: none;
      background: linear-gradient(
        to right,
        var(--t-color-primary) var($-temp-vars, --c-t-slider-percentage),
        lightgrey var($-temp-vars, --c-t-slider-percentage)
      );

      &::-webkit-slider-thumb {
        width: rem(20px);
        height: rem(20px);
        appearance: none;
        background: white;
        border: rem(2px) solid var(--t-color-primary);
        border-radius: 50%;
        cursor: pointer;
      }
    }

    .control {
      flex: 0 0 auto;
    }
  }
</style>
