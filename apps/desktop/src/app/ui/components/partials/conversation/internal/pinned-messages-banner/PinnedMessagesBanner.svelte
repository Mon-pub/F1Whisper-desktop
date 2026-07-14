<!--
  @component
  A banner above the message list listing the conversation's pinned messages (F1Whisper fork). Shows
  the pin count and the currently-focused pinned message; tapping cycles through the pins and jumps
  to each (scroll + highlight). Renders nothing when there are no pinned messages. Styled to match
  the conversation's existing above-input affordances (the compose-bar quote strip).
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {PinnedMessagesBannerProps} from '~/app/ui/components/partials/conversation/internal/pinned-messages-banner/props';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {pinnedMessageIds, getPreview, onjump}: PinnedMessagesBannerProps = $props();

  // The currently-focused pin (index into `pinnedMessageIds`). Clamped whenever the list changes.
  let currentIndex = $state(0);

  const clampedIndex = $derived(
    pinnedMessageIds.length === 0 ? 0 : Math.min(currentIndex, pinnedMessageIds.length - 1),
  );
  const currentMessageId = $derived(pinnedMessageIds[clampedIndex]);

  const preview = $derived(
    currentMessageId === undefined ? undefined : getPreview?.(currentMessageId),
  );

  function handleClick(): void {
    if (currentMessageId === undefined) {
      return;
    }
    onjump(currentMessageId);
    // Advance to the next pin so repeated taps cycle through all of them.
    if (pinnedMessageIds.length > 1) {
      currentIndex = (clampedIndex + 1) % pinnedMessageIds.length;
    }
  }
</script>

{#if pinnedMessageIds.length > 0}
  <div
    class="pinned-banner"
    role="button"
    tabindex="0"
    onclick={handleClick}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    }}
  >
    <span class="icon">
      <MdIcon theme="Filled">push_pin</MdIcon>
    </span>
    <div class="content">
      <span class="title">
        <Text
          color="mono-low"
          size="meta"
          text={pinnedMessageIds.length === 1
            ? $i18n.t('messaging.label--pinned-message', 'Pinned')
            : $i18n.t('messaging.label--pinned-message-counter', 'Pinned {current} / {total}', {
                current: (clampedIndex + 1).toString(),
                total: pinnedMessageIds.length.toString(),
              })}
          wrap={false}
        />
      </span>
      <span class="preview">
        <Text
          text={preview ?? $i18n.t('messaging.prose--pinned-message-fallback', 'Pinned message')}
          wrap={false}
        />
      </span>
    </div>
  </div>
{/if}

<style lang="scss">
  @use 'component' as *;

  .pinned-banner {
    display: flex;
    align-items: center;
    gap: rem(10px);
    padding: rem(8px) rem(12px);
    cursor: pointer;
    background-color: var(--mc-message-quote-background-color--hover);
    border-left: var(--mc-message-quote-border-width) solid var(--t-color-primary);

    &:hover {
      background-color: var(--cc-conversation-preview-background-color--active);
    }

    .icon {
      display: inline-flex;
      align-items: center;
      color: var(--t-color-primary);

      @include def-var(--c-icon-font-size, #{rem(18px)});
    }

    .content {
      display: flex;
      flex-direction: column;
      gap: rem(1px);
      min-width: 0;

      .title {
        color: var(--t-color-primary);
      }

      .preview {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
</style>
