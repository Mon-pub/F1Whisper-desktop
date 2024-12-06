<script lang="ts">
  import Emoji from '~/app/ui/components/atoms/emoji/Emoji.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {EmojiReactionsStripProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/internal/emoji-reactions-strip/props';
  import {i18n} from '~/app/ui/i18n';
  import {group} from '~/common/utils/array';
  import {UNSUPPORTED_EMOJI_MAPPING} from '~/common/utils/emoji';

  type $$Props = EmojiReactionsStripProps;

  export let direction: $$Props['direction'];
  export let onClickBucket: $$Props['onClickBucket'] = undefined;
  let unsortedReactions: $$Props['reactions'];
  export {unsortedReactions as reactions};

  let isExpanded = false;

  function handleClickToggleExpanded(event: MouseEvent): void {
    isExpanded = !isExpanded;
  }

  $: sortedReactionBuckets = group(
    // Sort ascending, so the oldest reactions come first.
    unsortedReactions.sort((a, b) => a.at.getTime() - b.at.getTime()),
    (reaction) => reaction.emoji,
  );
</script>

<ol class="container" data-alignment={direction === 'inbound' ? 'start' : 'end'}>
  {#each sortedReactionBuckets as [emoji, reactions], index (emoji)}
    {#if isExpanded || index < 5}
      {@const isSupported = reactions[0]?.type !== 'unsupported'}
      <li>
        <button
          class="bucket"
          class:active={reactions.some((reaction) => reaction.direction === 'outbound')}
          class:animated={index >= 5}
          style:animation-delay={`${(index - 5) * 0.05}s`}
          on:click={() => onClickBucket?.(emoji)}
        >
          <span class="emoji">
            <Emoji unicode={isSupported ? emoji : UNSUPPORTED_EMOJI_MAPPING} />
          </span>
          {#if reactions.length > 1}
            <span class="count">
              <Text size="body-small" text={`${reactions.length}`} wrap={false} />
            </span>
          {/if}
        </button>
      </li>
    {/if}
  {/each}

  {#if sortedReactionBuckets.size > 5}
    <button
      class="expand"
      class:expanded={isExpanded}
      style:animation-delay={`${(sortedReactionBuckets.size - 5 - 1) * 0.05}s`}
      on:click={handleClickToggleExpanded}
    >
      {#if isExpanded}
        {$i18n.t('messaging.label--emoji-reactions-collapse', 'See less')}
      {:else}
        +{sortedReactionBuckets.size - 5}
      {/if}
    </button>
  {/if}
</ol>

<style lang="scss">
  @use 'component' as *;

  .container {
    // Reset `ol` styles.
    list-style-type: none;
    padding: 0;

    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: start;
    gap: rem(2px);
    flex-wrap: wrap;

    .bucket,
    .expand {
      @extend %neutral-input;

      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: rem(3px);

      padding: rem(3px) rem(9px);
      background-color: var(--cc-emoji-reactions-strip-bucket-background-color);
      border: var(--cc-emoji-reactions-strip-bucket-border-color) solid rem(2px);
      border-radius: rem(15px);

      transition: background-color 0.125s ease-out;

      &:hover,
      &.active {
        cursor: pointer;

        background-color: var(--cc-emoji-reactions-strip-bucket-background-color--active);
      }
    }

    .bucket {
      .emoji,
      .count {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
      }

      .emoji {
        width: rem(18px);
        height: rem(18px);
        font-size: rem(14px);
        line-height: rem(18px);

        padding-bottom: rem(1px);
      }

      &:has(> .count) {
        padding: rem(3px) rem(6px) rem(3px) rem(4px);
      }

      &.animated {
        animation-name: bounce-in-up;
        animation-duration: 0.25s;
        animation-fill-mode: backwards;
      }
    }

    .expand {
      &.expanded {
        animation-name: fade-in-right;
        animation-duration: 0.25s;
        animation-fill-mode: backwards;
      }
    }

    &[data-alignment='end'] {
      flex-direction: row-reverse;
      justify-content: end;

      .expand {
        &.expanded {
          animation-name: fade-in-left;
        }
      }
    }
  }

  @keyframes fade-in-left {
    from {
      opacity: 0;
      transform: translateX(10px);
    }

    to {
      opacity: 1;
    }
  }

  @keyframes fade-in-right {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }

    to {
      opacity: 1;
    }
  }

  @keyframes bounce-in-up {
    from,
    60%,
    90%,
    to {
      animation-timing-function: cubic-bezier(0.215, 0.61, 0.355, 1);
    }

    from {
      opacity: 0;
      transform: translate3d(0, 10px, 0);
    }

    60% {
      opacity: 1;
      transform: translate3d(0, -3px, 0);
    }

    90% {
      transform: translate3d(0, 1px, 0);
    }

    to {
      transform: translate3d(0, 0, 0);
    }
  }
</style>
