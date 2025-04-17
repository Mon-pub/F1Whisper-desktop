<!--
  @component Renders a list of emojis that match a search term.
-->
<script lang="ts">
  import Emoji from '~/app/ui/components/atoms/emoji/Emoji.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import {
    findEmojiBySearchTerm,
    normalizeShortcode,
  } from '~/app/ui/components/partials/conversation/internal/inline-emoji-search-list/helpers';
  import type {InlineEmojiSearchListProps} from '~/app/ui/components/partials/conversation/internal/inline-emoji-search-list/props';
  import type {SingleUnicodeEmoji} from '~/common/utils/emoji';

  const {onclickitem, services, searchTerm}: InlineEmojiSearchListProps = $props();

  const emojisByGroupStore = services.emojis.getEmojisByGroupStore();

  const emojiDisplayList = $derived(findEmojiBySearchTerm(searchTerm, $emojisByGroupStore));

  function handleClickItem(event: MouseEvent, emoji: SingleUnicodeEmoji): void {
    event.preventDefault();

    onclickitem?.(emoji);
  }
</script>

{#if emojiDisplayList.length > 0}
  <ul class="container">
    {#each emojiDisplayList as inlineEmoji (inlineEmoji.emoji)}
      <button class="button" onclick={(event) => handleClickItem(event, inlineEmoji.emoji)}>
        <li class="item">
          <span class="emoji">
            <Emoji unicode={inlineEmoji.emoji} />
          </span>
          <span class="text">
            <Text text={`:${normalizeShortcode(inlineEmoji.shortcode) ?? inlineEmoji.label}:`} />
          </span>
        </li>
      </button>
    {/each}
  </ul>
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: start;
    justify-content: start;
    overflow: hidden;
    list-style-type: none;
    margin: rem(8px) 0;
    padding: 0;
    max-width: 100%;

    .button {
      @include clicktarget-button-rect;

      & {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: start;
        width: 100%;
        background-color: transparent;
        padding: rem(10px) rem(16px);
        text-decoration: inherit;
        color: inherit;

        .item {
          display: flex;
          column-gap: rem(8px);

          .emoji {
            font-size: large;
          }

          .text {
            color: var(--t-text-e2-color);
            font-size: medium;
            line-height: 1;
          }
        }
      }
    }
  }
</style>
