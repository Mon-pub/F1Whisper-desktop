<!--
  @component Renders an unstyled timer which shows the current duration between the given start date
  and now. Refreshes every second.
-->
<script lang="ts">
  import {onMount} from 'svelte';

  import type {TimerProps} from '~/app/ui/components/atoms/timer/props';
  import {formatDurationBetween} from '~/app/ui/utils/timestamp';
  import {TIMER, type TimerCanceller} from '~/common/utils/timer';

  const {from, snippetTimeDisplay}: TimerProps = $props();

  let now = $state<Date>(new Date());
  let nowUpdateCanceller: TimerCanceller | undefined;

  const currentDuration = $derived<string>(formatDurationBetween(from, now));

  onMount(() => {
    nowUpdateCanceller = TIMER.repeat(
      () => {
        now = new Date();
      },
      1000,
      'after-interval',
    );

    return nowUpdateCanceller;
  });
</script>

{#if snippetTimeDisplay === undefined}
  {currentDuration}
{:else}
  {@render snippetTimeDisplay(currentDuration)}
{/if}
