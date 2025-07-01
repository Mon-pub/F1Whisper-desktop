<!--
  @component Renders a panel with video and/or screensharing feeds.
-->
<script lang="ts">
  import type {VideoPanelProps} from '~/app/ui/components/partials/call-activity/internal/video-panel/props';
  import ParticipantFeed from '~/app/ui/components/partials/call-participant-feed/ParticipantFeed.svelte';
  import {isU53, type u53} from '~/common/types';

  const {feeds, activity, initialFullViewFeedIndex, onchangefullview, services}: VideoPanelProps =
    $props();

  let fullViewFeed = $state<(typeof feeds)[u53] | undefined>(
    initialFullViewFeedIndex === undefined ? undefined : feeds[initialFullViewFeedIndex],
  );
  let fullViewMode = $state<'auto' | 'manual'>('auto');

  /**
   * Explicitly set the `VideoPanel` to grid view. If the `VideoPanel` is not in full view, this
   * will be a no-op.
   */
  export function setGridView(): void {
    if (fullViewFeed !== undefined) {
      fullViewFeed = undefined;
      fullViewMode = 'manual';
    }
  }

  function setFullView(feedOrIndex?: u53 | typeof fullViewFeed): void {
    fullViewFeed = isU53(feedOrIndex) ? feeds[feedOrIndex] : feedOrIndex;
    fullViewMode = feedOrIndex === undefined ? 'manual' : fullViewMode;
  }

  $effect(() => {
    onchangefullview?.(fullViewFeed !== undefined);
  });

  $effect(() => {
    // Close fullView if the feed was closed or all remote feeds were closed
    if (fullViewFeed !== undefined && !hasFeed(fullViewFeed)) {
      fullViewFeed = undefined;
    }

    // Switch to fullView on remote shared screen if mode is 'auto'
    if (fullViewFeed === undefined && fullViewMode === 'auto') {
      const remoteScreen = feeds.find((feed) => feed.type === 'remoteScreen');
      if (remoteScreen !== undefined) {
        setFullView(remoteScreen);
      }
    }
  });

  function hasFeed(feed: VideoPanelProps['feeds'][number]): boolean {
    return feeds.find((f) => f.id === feed.id) !== undefined;
  }
</script>

<div class="container">
  {#if fullViewFeed !== undefined}
    <div class="fullViewFeed">
      <ParticipantFeed
        {...fullViewFeed}
        {activity}
        isFullView
        onclick={(event) => {
          setFullView();
        }}
        onclicktogglefullview={(event) => {
          setFullView();
        }}
        {services}
      />
    </div>
  {/if}

  <div class="feeds" data-layout={fullViewFeed !== undefined ? 'full' : 'grid'}>
    {#each feeds as feed, index (feed.id)}
      {#if feed.id !== fullViewFeed?.id}
        <ParticipantFeed
          {...feed}
          {activity}
          isFullView={false}
          onclick={(event) => {
            setFullView(index);
          }}
          onclicktogglefullview={(event) => {
            setFullView(index);
          }}
          {services}
        />
      {/if}
    {/each}
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    align-items: start;
    justify-content: stretch;
    gap: rem(12px);

    padding: rem(12px);

    .fullViewFeed {
      flex: 1 1 auto;
      min-width: 0;

      height: 100%;
    }

    .feeds {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      align-content: start;
      justify-items: stretch;
      gap: rem(12px);

      width: 100%;
      height: 100%;

      overflow-y: auto;
      scrollbar-width: none;

      &[data-layout='full'] {
        flex: 0 0 auto;

        grid-template-columns: 100%;
        width: rem(256px);
      }

      &:is(:empty) {
        display: none;
      }
    }
  }
</style>
