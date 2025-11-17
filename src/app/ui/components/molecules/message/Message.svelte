<!--
  @component Renders a chat message.
-->
<script lang="ts">
  import LazyImage from '~/app/ui/components/atoms/lazy-image/LazyImage.svelte';
  import Prose from '~/app/ui/components/atoms/prose/Prose.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import AudioPlayer from '~/app/ui/components/molecules/audio-player/AudioPlayer.svelte';
  import Bubble from '~/app/ui/components/molecules/message/internal/bubble/Bubble.svelte';
  import FileInfo from '~/app/ui/components/molecules/message/internal/file-info/FileInfo.svelte';
  import Indicator from '~/app/ui/components/molecules/message/internal/indicator/Indicator.svelte';
  import Quote from '~/app/ui/components/molecules/message/internal/quote/Quote.svelte';
  import Sender from '~/app/ui/components/molecules/message/internal/sender/Sender.svelte';
  import type {MessageProps} from '~/app/ui/components/molecules/message/props';
  import Poll from '~/app/ui/components/partials/poll/Poll.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import {MAX_CONVERSATION_THUMBNAIL_SIZE} from '~/common/dom/ui/media';
  import type {u53} from '~/common/types';
  import {durationToString} from '~/common/utils/date';
  import {hasProperty} from '~/common/utils/object';

  const {
    alt,
    clickable = false,
    content,
    direction,
    file,
    footerHint,
    highlighted,
    onclick,
    onclickfileinfo,
    onclickquote,
    onclickthumbnail,
    oncompletehighlightanimation,
    onerror,
    options = {},
    pollData,
    quote,
    receiver,
    sender,
    services,
    status,
    timestamp,
  }: MessageProps = $props();

  function getContentLength(value: typeof content): u53 {
    if (value === undefined) {
      return 0;
    }
    if (hasProperty(value, 'sanitizedHtml')) {
      return value.sanitizedHtml.length;
    }

    return value.text.length;
  }

  const contentLength = $derived(getContentLength(content));

  /*
   * Message info placement:
   * - Text message: in footer.
   * - File message:
   *  - ...with caption: in footer.
   *  - ...without caption: embedded in the file preview (e.g. thumbnail).
   */
  const messageInfoPlacement = $derived<'preview' | 'footer'>(
    file !== undefined && content === undefined ? 'preview' : 'footer',
  );
</script>

<Bubble
  {direction}
  {clickable}
  {highlighted}
  {onclick}
  {oncompletehighlightanimation}
  padding={file?.thumbnail === undefined ? 'md' : 'xs'}
>
  <div class={`body ${direction}`} class:clickable>
    {#if options.showSender !== false && direction !== 'outbound'}
      <span class="sender">
        <Sender
          color={sender.color}
          messageHasThumbnail={file?.thumbnail !== undefined}
          name={sender.name}
        />
      </span>
    {/if}

    {#if quote?.type === 'not-found' || quote?.type === 'deleted'}
      <Quote
        {alt}
        content={{
          text: quote.fallbackText,
        }}
      />
    {:else if quote !== undefined}
      <span class="quote">
        <Quote
          {alt}
          content={quote.content}
          clickable={true}
          file={quote.file}
          onclick={onclickquote}
          poll={quote.poll}
          sender={quote.sender}
        />
      </span>
    {/if}

    {#if file !== undefined}
      {#if file.type === 'audio'}
        <span class="audio">
          <AudioPlayer duration={file.duration} fetchAudio={file.fetchFileBytes} {onerror}>
            {#snippet snippetFooter(audioTimestamp)}
              <span class="footer">
                <span class="size">
                  <Text text={durationToString(audioTimestamp ?? 0)} wrap={false} />
                </span>
                {#if messageInfoPlacement === 'preview'}
                  <span class="status">
                    <Text text={timestamp.fluent} wrap={false} />
                    <Indicator {direction} options={options.indicatorOptions} {status} />
                  </span>
                {/if}
              </span>
            {/snippet}
          </AudioPlayer>
        </span>
      {:else if file.type === 'file'}
        <span class="file">
          <FileInfo
            mediaType={file.mediaType}
            name={file.name}
            onclick={onclickfileinfo}
            sizeInBytes={file.sizeInBytes}
          >
            {#snippet snippetFooterAside()}
              {#if messageInfoPlacement === 'preview'}
                <Text text={timestamp.fluent} wrap={false} />
                <Indicator {direction} options={options.indicatorOptions} {status} />
              {/if}
            {/snippet}
          </FileInfo>
        </span>
      {:else if file.type === 'image' || file.type === 'video'}
        <span class="thumbnail">
          {#if file.type === 'video' && options.hideVideoPlayButton !== true}
            <button class="play-button" onclick={onclickthumbnail}>
              <MdIcon theme="Filled">play_arrow</MdIcon>
            </button>
          {/if}

          <div class="badges">
            {#if file.type === 'video' && file.duration !== undefined}
              <span class="badge">
                <MdIcon theme="Filled">videocam</MdIcon>
                <span class="label">
                  {durationToString(file.duration)}
                </span>
              </span>
            {/if}

            {#if messageInfoPlacement === 'preview'}
              <span class="badge status">
                <Text text={timestamp.short} wrap={false} />
                <Indicator {direction} options={options.indicatorOptions} {status} />
              </span>
            {/if}
          </div>

          {#if file.thumbnail !== undefined}
            <LazyImage
              byteStore={file.thumbnail.thumbnailStore}
              constraints={file.thumbnail.constraints ?? {
                min: {
                  // Dynamically increase the min width for longer text.
                  width: Math.min(125 + contentLength, 180),
                  height: 70,
                  size: 16384,
                },
                max: {
                  width: MAX_CONVERSATION_THUMBNAIL_SIZE,
                  height: MAX_CONVERSATION_THUMBNAIL_SIZE,
                  size: 65536,
                },
              }}
              description={alt}
              dimensions={file.thumbnail.expectedDimensions}
              isClickable={true}
              isFocusable={true}
              onclick={onclickthumbnail}
              responsive={true}
            />
          {/if}
        </span>
      {:else}
        {svelteUnreachable(file.type)}
      {/if}
    {/if}

    {#if pollData !== undefined && receiver !== undefined}
      <Poll {pollData} {receiver} {services} />
    {/if}

    {#if content !== undefined}
      <div class="text" class:deleted={status.deleted !== undefined}>
        <Prose {content} selectable={true} wrap={true} />
      </div>
    {/if}

    {#if messageInfoPlacement === 'footer'}
      <div class="footer">
        <span class="status">
          {#if footerHint !== undefined}
            <Text text={footerHint} wrap={false}></Text>
          {/if}
          <Text text={timestamp.fluent} wrap={false} />
          <Indicator {direction} options={options.indicatorOptions} {status} />
        </span>
      </div>
    {/if}
  </div>
</Bubble>

<style lang="scss">
  @use 'component' as *;

  .body {
    position: relative;
    display: flex;
    align-items: stretch;
    justify-content: start;
    flex-direction: column;

    .sender {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: stretch;

      // Force element to only take up as much space as is available to it, and not cause to grow
      // its container.
      width: min-content;
      min-width: 100%;

      padding: 0 0 rem(4px) 0;

      // If `.sender` is a general-preceding sibling of `.audio`, `.file`, or `.thumbnail`.
      &:has(:global(~ .audio)) {
        padding: 0 0 rem(8px) 0;
      }

      &:has(:global(~ .file)) {
        padding: 0 0 rem(8px) 0;
      }

      &:has(:global(~ .thumbnail)) {
        padding: rem(1px) rem(8px) rem(4px);
      }
    }

    .text {
      @extend %font-normal-400;

      &.deleted {
        color: var(--t-text-e2-color);
        font-style: italic;
      }
    }

    // If `.text` is a general-subsequent sibling of `.file` or `.quote`.
    .file ~ .text,
    .quote ~ .text {
      padding-top: rem(8px);
    }

    // If `.text` is a general-subsequent sibling of `.thumbnail`.
    .thumbnail ~ .text {
      padding: rem(8px) rem(8px) rem(0px);

      // Prevent text from growing larger than the thumbnail.
      width: min-content;
      min-width: 100%;
    }

    &:not(.clickable) {
      .quote {
        position: relative;

        &::before {
          opacity: 0;
          transition: opacity 0.1s ease-out;

          content: '';
          display: block;
          position: absolute;
          top: rem(-4px);
          left: rem(-4px);
          bottom: rem(-4px);
          right: rem(-4px);
          background-color: var(--mc-message-quote-background-color--hover);
          border-radius: rem(10px);
        }

        &:hover {
          cursor: pointer;

          &::before {
            opacity: 1;
          }
        }
      }

      .quote:first-child {
        &::before {
          left: rem(-6px);
          right: rem(-6px);
        }
      }
    }

    .audio {
      .footer {
        @extend %font-small-400;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-width: 100%;
        gap: rem(8px);
        color: var(--mc-message-file-size-color);
      }
    }

    .thumbnail {
      position: relative;
      border-radius: rem(10px);
      overflow: hidden;

      .play-button {
        --c-icon-button-naked-outer-background-color--hover: var(
          --mc-message-overlay-button-background-color--hover
        );
        --c-icon-button-naked-outer-background-color--focus: var(
          --mc-message-overlay-button-background-color--focus
        );
        --c-icon-button-naked-outer-background-color--active: var(
          --mc-message-overlay-button-background-color--active
        );

        @include clicktarget-button-circle;

        & {
          display: flex;
          position: absolute;
          justify-content: center;
          align-items: center;
          color: var(--mc-message-overlay-button-color);
          background-color: var(--mc-message-overlay-button-background-color);
          width: rem(44px);
          height: rem(44px);
          left: calc(50% - rem(22px));
          top: calc(50% - rem(22px));
          font-size: rem(24px);
        }
      }

      .badges {
        position: absolute;
        display: flex;
        gap: rem(8px);
        align-items: center;
        justify-content: space-between;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;

        .badge {
          @include def-var(--c-icon-font-size, var(--mc-message-indicator-icon-size));
          @extend %font-small-400;

          display: flex;
          align-items: center;
          gap: var(--mc-message-indicator-column-gap);

          pointer-events: initial;
          margin: rem(8px);
          padding: rem(1px) rem(6px);
          border-radius: rem(10px);
          color: var(--mc-message-badge-color);
          background-color: var(--mc-message-badge-background-color);

          &.status {
            margin-left: auto;
          }
        }
      }
    }

    .footer {
      width: 100%;
      display: grid;

      .status {
        @include def-var(--c-icon-font-size, var(--mc-message-indicator-icon-size));
        @extend %font-small-400;

        justify-self: end;
        display: flex;
        align-items: center;
        gap: var(--mc-message-indicator-column-gap);
        color: var(--mc-message-indicator-label);
      }
    }

    .thumbnail ~ .text ~ .footer {
      padding: rem(0px) rem(10px) rem(8px);
    }
  }
</style>
