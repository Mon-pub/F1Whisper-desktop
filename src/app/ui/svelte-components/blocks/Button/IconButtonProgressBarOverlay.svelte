<script lang="ts">
  import type {CircularProgressVariant} from '~/app/ui/svelte-components/blocks/CircularProgress';
  import CircularProgress from '~/app/ui/svelte-components/blocks/CircularProgress/CircularProgress.svelte';

  interface Props {
    /**
     * The variant of the progress indicator to show.
     */
    readonly variant?: CircularProgressVariant;
    /**
     * Progress percentage value to be used. This will be ignored if variant
     * is 'indeterminate'.
     */
    readonly value?: number;
  }

  const {variant = 'indeterminate', value = 0}: Props = $props();
</script>

<div>
  <CircularProgress {variant} {value} />
</div>

<style lang="scss">
  @use 'component' as *;

  div {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    margin: em(1px);

    @include def-var(
      (
          --c-circular-progress-stroke-color:
            var(--c-icon-button-progress-bar-overlay-color, default),
          --c-circular-progress-thickness: #{em(4px)}
        )...
    );
  }
</style>
