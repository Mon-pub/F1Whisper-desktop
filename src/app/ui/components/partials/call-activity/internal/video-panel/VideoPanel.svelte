<!--
  @component Renders a panel with video and/or screensharing feeds.
-->
<script lang="ts">
  import type {VideoPanelProps} from '~/app/ui/components/partials/call-activity/internal/video-panel/props';
  import ParticipantFeed from '~/app/ui/components/partials/call-participant-feed/ParticipantFeed.svelte';
  import {isU53, type u53} from '~/common/types';

  const {feeds, activity, onchangefullview, services}: VideoPanelProps = $props();

  let fullViewFeed = $state<(typeof feeds)[u53] | undefined>(undefined);
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
    // Close fullView if the feed was closed or all remote feeds were closed.
    if (fullViewFeed !== undefined && !hasFeed(fullViewFeed)) {
      fullViewFeed = undefined;
    }

    // Switch to fullView on remote shared screen if mode is 'auto'.
    if (activity.isExpanded && fullViewFeed === undefined && fullViewMode === 'auto') {
      const remoteScreen = feeds.find((feed) => feed.type === 'remoteScreen');
      if (remoteScreen !== undefined) {
        setFullView(remoteScreen);
      }
    }
  });

  $effect(() => {
    // Close full view if panel is collapsed.
    if (!activity.isExpanded) {
      fullViewFeed = undefined;
    }
  });

  function hasFeed(feed: VideoPanelProps['feeds'][number]): boolean {
    return feeds.find((f) => f.id === feed.id) !== undefined;
  }
</script>

<div
  class="container"
  data-activity-expanded={activity.isExpanded}
  data-activity-layout={activity.layout}
  data-feed-count={feeds.length <= 12 ? feeds.length : 'many'}
>
  {#each feeds as feed, index (feed.id)}
    {@const isExpanded = feed.id === fullViewFeed?.id}

    <div class="feed" data-expanded={isExpanded} data-index={index + 1}>
      <ParticipantFeed
        {...feed}
        {activity}
        isFullView={isExpanded}
        onclick={(event) => {
          setFullView(isExpanded ? undefined : index);
        }}
        onclicktogglefullview={(event) => {
          setFullView(isExpanded ? undefined : index);
        }}
        {services}
      />
    </div>
  {/each}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    position: relative;
    display: grid;
    grid-template-columns: repeat(1, 1fr);
    grid-auto-rows: 1fr;
    align-items: start;
    gap: rem(12px);

    width: 100%;

    &[data-activity-layout='regular'] {
      gap: rem(8px);
    }

    // Styles for focus mode (single expanded feed).
    &[data-activity-layout='regular'][data-activity-expanded='true']:has(
        .feed[data-expanded='true']
      ) {
      grid-template-columns: 1fr rem(256px);
      grid-auto-rows: min-content;

      .feed[data-expanded='true'] {
        position: fixed;
        top: rem(64px + 16px);
        left: rem(16px);
        right: rem(256px + 12px + 16px);
        bottom: rem(92px);
      }

      .feed:not([data-expanded='true']) {
        grid-column: 2;
        height: min-content;
      }

      // If there are no sidebar items (the expanded item is the only child), don't show a sidebar.
      &:has(.feed[data-expanded='true']:only-child) {
        grid-template-columns: 1fr;
      }

      .feed[data-expanded='true']:only-child {
        right: rem(16px);
      }
    }
  }

  @container activity (min-width: 512px) {
    .container:not(
        :has(.feed[data-expanded='true'])
      )[data-activity-layout='regular'][data-activity-expanded='true'] {
      grid-template-columns: repeat(2, 1fr);

      // Single feed: single column.
      &[data-feed-count='1'] {
        height: 100%;
        grid-template-columns: repeat(1, 1fr);
      }
    }
  }

  @container activity (min-width: 768px) {
    .container:not(
        :has(.feed[data-expanded='true'])
      )[data-activity-layout='regular'][data-activity-expanded='true'] {
      grid-template-columns: repeat(3, 1fr);

      // Single feed: single column, full height.
      &[data-feed-count='1'] {
        height: 100%;
        grid-template-columns: repeat(1, 1fr);
        grid-template-rows: repeat(1, 100%);

        .feed {
          height: 100%;
        }
      }

      // 2 feeds: two columns.
      &[data-feed-count='2'] {
        grid-template-columns: repeat(2, calc(50% - 8px / 2));
      }

      // 3 or 4 feeds: two columns.
      &[data-feed-count='3'],
      &[data-feed-count='4'] {
        grid-template-columns: repeat(2, calc(50% - 8px / 2));
      }
    }
  }

  @container activity (min-width: 768px) and (min-height: 768px) {
    .container:not(
        :has(.feed[data-expanded='true'])
      )[data-activity-layout='regular'][data-activity-expanded='true'] {
      // Single feed: single column, full height.
      &[data-feed-count='1'] {
        height: 100%;
        grid-template-rows: repeat(1, 100%);

        .feed {
          width: 100%;
          height: 100%;
        }
      }

      // 2 feeds: two columns, full height.
      &[data-feed-count='2'] {
        height: 100%;

        .feed {
          width: 100%;
          height: 100%;
        }
      }

      // 3 or 4 feeds: two columns, full height.
      &[data-feed-count='3'],
      &[data-feed-count='4'] {
        height: 100%;
        grid-template-rows: repeat(2, calc(50% - 8px / 2));

        .feed {
          width: 100%;
          height: 100%;
        }
      }
    }
  }

  @container activity (min-width: 1024px) {
    .container:not(
        :has(.feed[data-expanded='true'])
      )[data-activity-layout='regular'][data-activity-expanded='true'] {
      grid-template-columns: repeat(4, 1fr);

      // Single feed: single column, full height.
      &[data-feed-count='1'] {
        height: 100%;
        grid-template-columns: repeat(1, 1fr);
        grid-template-rows: repeat(1, 100%);

        .feed {
          height: 100%;
        }
      }

      // 2 feeds: two columns.
      &[data-feed-count='2'] {
        grid-template-columns: repeat(2, calc(50% - 8px / 2));
      }

      // 3 or 4 feeds: two columns.
      &[data-feed-count='3'],
      &[data-feed-count='4'] {
        grid-template-columns: repeat(2, calc(50% - 8px / 2));
      }

      // 5 or 6 feeds: three columns.
      &[data-feed-count='5'],
      &[data-feed-count='6'] {
        grid-template-columns: repeat(3, calc(33.333% - 16px / 3));
      }

      // More than 12 feeds.
      &[data-feed-count='many'] {
        grid-template-columns: repeat(5, 1fr);
      }
    }
  }

  @container activity (min-width: 1024px) and (min-height: 768px) {
    .container:not(
        :has(.feed[data-expanded='true'])
      )[data-activity-layout='regular'][data-activity-expanded='true'] {
      // Single feed: single column, full height.
      &[data-feed-count='1'] {
        height: 100%;
        grid-template-rows: repeat(1, 100%);

        .feed {
          width: 100%;
          height: 100%;
        }
      }

      // 2 feeds: two columns, full height.
      &[data-feed-count='2'] {
        height: 100%;

        .feed {
          width: 100%;
          height: 100%;
        }
      }

      // 3 or 4 feeds: two columns, full height.
      &[data-feed-count='3'],
      &[data-feed-count='4'] {
        height: 100%;
        grid-template-rows: repeat(2, calc(50% - 8px / 2));

        .feed {
          width: 100%;
          height: 100%;
        }
      }

      // 5 or 6 feeds: three columns, full height.
      &[data-feed-count='5'],
      &[data-feed-count='6'] {
        height: 100%;
        grid-template-rows: repeat(2, calc(50% - 8px / 2));

        .feed {
          width: 100%;
          height: 100%;
        }
      }
    }
  }

  @container activity (min-width: 1440px) {
    .container:not(
        :has(.feed[data-expanded='true'])
      )[data-activity-layout='regular'][data-activity-expanded='true'] {
      // More than 12 feeds.
      &[data-feed-count='many'] {
        grid-template-columns: repeat(6, 1fr);
      }
    }
  }
</style>
