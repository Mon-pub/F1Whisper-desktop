<script lang="ts">
  import Emoji from '~/app/ui/components/atoms/emoji/Emoji.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {EmojiReactionsStripProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/regular-message/internal/emoji-reactions-strip/props';
  import Tooltip from '~/app/ui/generic/popover/Tooltip.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {group} from '~/common/utils/array';
  import {UNSUPPORTED_EMOJI_MAPPING} from '~/common/utils/emoji';

  type $$Props = EmojiReactionsStripProps;

  export let id: $$Props['id'];
  export let conversation: $$Props['conversation'];
  export let direction: $$Props['direction'];
  export let onClickBucket: $$Props['onClickBucket'];
  export let onClickOpenEmojiPicker: $$Props['onClickOpenEmojiPicker'];
  export let openEmojiPickerButtonAnchorName: $$Props['openEmojiPickerButtonAnchorName'];
  export let options: NonNullable<$$Props['options']> = {};
  let unsortedReactions: $$Props['reactions'];
  export {unsortedReactions as reactions};

  let tooltipComponent: SvelteNullableBinding<Tooltip> = null;
  let currentTooltip:
    | {
        readonly anchorName: `--${string}`;
        readonly text: string;
      }
    | undefined = undefined;

  let isExpanded = false;

  function handleMouseEnterBucket(
    anchorName: `--${string}`,
    reactions: typeof unsortedReactions,
  ): void {
    // Don't display tooltip if the only reaction is from the user themself.
    if (reactions.length === 1 && reactions[0]?.sender.type === 'self') {
      return;
    }

    currentTooltip = {
      anchorName,
      text: reactions
        .sort((a, b) => {
          if (a.sender.type === 'self') {
            return -1;
          }
          if (b.sender.type === 'self') {
            return 1;
          }

          return a.sender.name.localeCompare(b.sender.name);
        })
        .map((reaction) =>
          reaction.sender.type === 'self'
            ? $i18n.t('contacts.label--own-name')
            : reaction.sender.name,
        )
        .join(', '),
    };
    tooltipComponent?.open();
  }

  function handleMouseLeaveBucket(event: MouseEvent): void {
    tooltipComponent?.close();
    currentTooltip = undefined;
  }

  function handleClickToggleExpanded(event: MouseEvent): void {
    isExpanded = !isExpanded;
  }

  $: sortedReactionBuckets = group(
    // Sort ascending, so the oldest reactions come first.
    unsortedReactions.sort((a, b) => a.at.getTime() - b.at.getTime()),
    (reaction) => reaction.emoji,
  );
</script>

<Tooltip bind:this={tooltipComponent} anchorName={currentTooltip?.anchorName}>
  <span class="tooltip-content">
    <!-- Empty string is fine here, because if `anchorName` is defined, `text` is defined as well,
    and otherwise the tooltip would be hidden anyway. -->
    <Text alignment="center" text={currentTooltip?.text ?? ''} />
  </span>
</Tooltip>

<ol class="container" data-alignment={direction === 'inbound' ? 'start' : 'end'}>
  {#each sortedReactionBuckets as [emoji, reactions], index (emoji)}
    {#if isExpanded || index < 5}
      {@const isSupported = reactions[0]?.type !== 'unsupported'}

      <li>
        <!-- TODO(DESK-1713): Remove the sandbox restriction (`disabled` prop). -->
        <button
          class="bucket"
          class:active={reactions.some((reaction) => reaction.direction === 'outbound')}
          class:animated={index >= 5}
          style:anchor-name={`--${id}-bucket-${emoji}`}
          style:animation-delay={`${(index - 5) * 0.05}s`}
          on:click={(event) => onClickBucket(event, emoji)}
          on:mouseenter={() => handleMouseEnterBucket(`--${id}-bucket-${emoji}`, reactions)}
          on:mouseleave={handleMouseLeaveBucket}
          disabled={!conversation.emojiReactionsFeatureSupport.supported ||
            import.meta.env.BUILD_ENVIRONMENT !== 'sandbox'}
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
      <Text
        size="body-small"
        text={isExpanded
          ? $i18n.t('messaging.label--emoji-reactions-collapse', 'See less')
          : `+${sortedReactionBuckets.size - 5}`}
        wrap={false}
      />
    </button>
  {/if}
  <!-- TODO(DESK-1713): Remove the sandbox restriction. -->
  {#if import.meta.env.BUILD_ENVIRONMENT === 'sandbox' && sortedReactionBuckets.size > 0 && options.showAddEmojiReactionButton === true}
    <div class="add">
      <button
        class:expanded={isExpanded}
        style:anchor-name={openEmojiPickerButtonAnchorName}
        style:animation-delay={`${(sortedReactionBuckets.size - 5) * 0.05}s`}
        on:click={onClickOpenEmojiPicker}
      >
        <MdIcon theme="Outlined">add_reaction</MdIcon>
      </button>
    </div>
  {/if}
</ol>

<style lang="scss">
  @use 'component' as *;

  .tooltip-content {
    padding: 0;
    margin: rem(10px);
    max-width: rem(280px);
    text-align: center;
  }

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
    .expand,
    .add button {
      @extend %neutral-input;

      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: rem(3px);

      height: rem(28px);
      padding: 0 rem(9px);
      background-color: var(--cc-emoji-reactions-strip-bucket-background-color);
      color: var(--cc-emoji-reactions-strip-bucket-color);
      border: var(--cc-emoji-reactions-strip-bucket-border-color) solid rem(1px);
      border-radius: rem(15px);

      transition: background-color 0.125s ease-out;

      &:hover:not(:disabled) {
        cursor: pointer;

        background-color: var(--cc-emoji-reactions-strip-bucket-background-color--active);

        &:not(.active) {
          border: var(--cc-emoji-reactions-strip-bucket-border-color--hover) solid rem(1px);
        }
      }
    }

    .bucket,
    .add button {
      &.active {
        background-color: var(--cc-emoji-reactions-strip-bucket-background-color--active);
        border: var(--cc-emoji-reactions-strip-bucket-border-color--active) solid rem(1px);

        &:hover {
          background-color: var(--cc-emoji-reactions-strip-bucket-background-color--active--hover);
        }
      }

      &.active:not(:disabled) {
        cursor: pointer;
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
        font-size: rem(16px);
        line-height: rem(16px);
      }

      .count {
        font-weight: 500;
      }

      &:has(> .count) {
        padding: rem(3px) rem(5px) rem(3px) rem(3px);
      }

      &.animated {
        animation-name: bounce-in-up;
        animation-duration: 0.25s;
        animation-fill-mode: backwards;
      }
    }

    .expand,
    .add button {
      &.expanded {
        animation-name: fade-in-right;
        animation-duration: 0.25s;
        animation-fill-mode: backwards;
      }
    }

    .expand {
      padding: 0 rem(11px);
      font-weight: 500;
    }

    .add {
      position: relative;

      button {
        padding: 0 rem(9px);
        font-size: rem(18px);
        line-height: rem(18px);
      }
    }

    &[data-alignment='end'] {
      flex-direction: row-reverse;
      justify-content: end;

      .expand,
      .add button {
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
