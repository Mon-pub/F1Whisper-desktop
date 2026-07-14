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
  import {i18n} from '~/app/ui/i18n';
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
    disappearing,
    file,
    footerHint,
    highlighted,
    onclick,
    onclickfileinfo,
    onclickquote,
    onclickthumbnail,
    oncompletehighlightanimation,
    onerror,
    onlistenoncecomplete,
    options = {},
    pinned = false,
    pollData,
    quote,
    receiver,
    sender,
    services,
    status,
    timestamp,
  }: MessageProps = $props();

  /**
   * Extract the display host from a link-preview URL (F1Whisper fork). Falls back to the raw URL if
   * it cannot be parsed.
   */
  function getLinkPreviewDomain(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

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

  // Spoiler reveal state for image/video thumbnails (F1Whisper fork). A spoiler thumbnail is
  // blurred until tapped; the first tap reveals it (and is swallowed), only a second tap opens the
  // media viewer. Reveal state resets whenever the underlying file changes (i.e. on conversation
  // change, where the component is re-rendered with a different message).
  let spoilerRevealed = $state(false);
  $effect(() => {
    // Re-hide whenever the file reference changes (e.g. message recycled into another conversation).
    // Reading `file` here registers the effect's dependency on it.
    void file;
    spoilerRevealed = false;
  });

  const isSpoiler = $derived(
    file !== undefined && (file.type === 'image' || file.type === 'video') && file.spoiler === true,
  );
  const isSpoilerHidden = $derived(isSpoiler && !spoilerRevealed);

  // A consumed (burned) listen-once voice message (F1Whisper fork). Its blob is gone, so instead of
  // an unplayable audio player the bubble collapses to a small localized note (matching Android):
  // the recipient sees "Voice message expired", the sender "Listen-once voice message".
  const isBurnedAudio = $derived(
    file !== undefined &&
      file.type === 'audio' &&
      file.listenOnce === true &&
      file.listenOnceConsumed === true,
  );

  function handleThumbnailClick(event: MouseEvent): void {
    // First tap on a hidden spoiler reveals it instead of opening the media viewer.
    if (isSpoilerHidden) {
      event.preventDefault();
      event.stopPropagation();
      spoilerRevealed = true;
      return;
    }
    onclickthumbnail?.(event);
  }

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

    {#if file?.forwarded === true}
      <span class="forwarded">
        <MdIcon theme="Outlined">forward</MdIcon>
        <Text
          size="body-small"
          text={$i18n.t('messaging.label--forwarded-message', 'Forwarded')}
          wrap={false}
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
        {#if isBurnedAudio}
          <span class="burned-audio">
            <span class="note">
              <MdIcon theme="Outlined">timer_off</MdIcon>
              <Text
                size="body-small"
                text={direction === 'outbound'
                  ? $i18n.t('messaging.label--listen-once-sent', 'Listen-once voice message')
                  : $i18n.t('messaging.label--listen-once-expired', 'Voice message expired')}
                wrap={false}
              />
            </span>
            {#if messageInfoPlacement === 'preview'}
              <span class="status">
                {@render pinnedIcon()}
                {@render disappearingClock()}
                <Text text={timestamp.fluent} wrap={false} />
                <Indicator {direction} options={options.indicatorOptions} {status} />
              </span>
            {/if}
          </span>
        {:else}
          <span class="audio">
            <AudioPlayer audioFile={file} {onerror} {onlistenoncecomplete}>
              {#snippet snippetFooter(audioTimestamp)}
                <span class="footer">
                  <span class="size">
                    {#if file.sync.failureReason !== undefined}
                      <span class="warning-icon">
                        <MdIcon title={file.sync.failureReason} theme="Filled">warning</MdIcon>
                      </span>
                    {/if}
                    <Text text={durationToString(audioTimestamp ?? 0)} wrap={false} />
                  </span>
                  {#if messageInfoPlacement === 'preview'}
                    <span class="status">
                      {@render pinnedIcon()}
                      {@render disappearingClock()}
                      <Text text={timestamp.fluent} wrap={false} />
                      <Indicator {direction} options={options.indicatorOptions} {status} />
                    </span>
                  {/if}
                </span>
              {/snippet}
            </AudioPlayer>
          </span>
        {/if}
      {:else if file.type === 'file'}
        <span class="file">
          <FileInfo
            mediaType={file.mediaType}
            name={file.name}
            onclick={onclickfileinfo}
            sizeInBytes={file.sizeInBytes}
            syncFailureReason={file.sync.failureReason}
          >
            {#snippet snippetFooterAside()}
              {#if messageInfoPlacement === 'preview'}
                {@render pinnedIcon()}
                {@render disappearingClock()}
                <Text text={timestamp.fluent} wrap={false} />
                <Indicator {direction} options={options.indicatorOptions} {status} />
              {/if}
            {/snippet}
          </FileInfo>
        </span>
      {:else if file.type === 'image' || file.type === 'video'}
        <span class="thumbnail" class:spoiler-hidden={isSpoilerHidden}>
          {#if file.type === 'video' && options.hideVideoPlayButton !== true && !isSpoilerHidden}
            <button class="play-button" onclick={handleThumbnailClick}>
              <MdIcon theme="Filled">play_arrow</MdIcon>
            </button>
          {/if}

          {#if isSpoilerHidden}
            <button
              class="spoiler-reveal"
              onclick={handleThumbnailClick}
              title={$i18n.t('messaging.action--reveal-spoiler', 'Tap to reveal')}
            >
              <MdIcon theme="Filled">visibility_off</MdIcon>
              <Text
                size="body-small"
                text={$i18n.t('messaging.action--reveal-spoiler', 'Tap to reveal')}
                wrap={false}
              />
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

            {#if messageInfoPlacement === 'preview' || file.sync.failureReason !== undefined}
              <span class="badge status">
                {#if file.sync.failureReason !== undefined}
                  <span class="warning-icon">
                    <MdIcon title={file.sync.failureReason} theme="Filled">warning</MdIcon>
                  </span>
                {/if}
                {#if messageInfoPlacement === 'preview'}
                  {@render pinnedIcon()}
                  {@render disappearingClock()}
                  <Text text={timestamp.short} wrap={false} />
                  <Indicator {direction} options={options.indicatorOptions} {status} />
                {/if}
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
              onclick={handleThumbnailClick}
              responsive={true}
            />
          {/if}
        </span>

        {#if file.linkPreview !== undefined}
          {@const linkPreview = file.linkPreview}
          <a class="link-preview" href={linkPreview.url} target="_blank" rel="noopener noreferrer">
            <span class="domain">
              <MdIcon theme="Outlined">link</MdIcon>
              <Text size="body-small" text={getLinkPreviewDomain(linkPreview.url)} wrap={false} />
            </span>
            {#if linkPreview.title !== undefined && linkPreview.title !== ''}
              <span class="title">
                <Text family="primary" size="body-small" text={linkPreview.title} />
              </span>
            {/if}
            {#if linkPreview.description !== undefined && linkPreview.description !== ''}
              <span class="description">
                <Text color="mono-low" size="body-small" text={linkPreview.description} />
              </span>
            {/if}
          </a>
        {/if}
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
          {@render pinnedIcon()}
          {@render disappearingClock()}
          <Text text={timestamp.fluent} wrap={false} />
          <Indicator {direction} options={options.indicatorOptions} {status} />
        </span>
      </div>
    {/if}
  </div>
</Bubble>

{#snippet disappearingClock()}
  {#if disappearing !== undefined}
    <span
      class="disappearing-clock"
      title={$i18n.t('messaging.label--disappearing-message', 'Disappearing message')}
    >
      <MdIcon theme="Outlined">timer</MdIcon>
    </span>
  {/if}
{/snippet}

{#snippet pinnedIcon()}
  {#if pinned}
    <span class="pinned-icon" title={$i18n.t('messaging.label--pinned-message', 'Pinned')}>
      <MdIcon theme="Filled">push_pin</MdIcon>
    </span>
  {/if}
{/snippet}

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

    .forwarded {
      @extend %font-small-400;

      display: flex;
      align-items: center;
      gap: rem(4px);
      padding: 0 0 rem(4px) 0;
      color: var(--mc-message-indicator-label);
      font-style: italic;

      @include def-var(--c-icon-font-size, #{rem(16px)});

      // Match the thumbnail's inset header padding when the message is a media message.
      &:has(:global(~ .thumbnail)) {
        padding: rem(1px) rem(8px) rem(4px);
      }
    }

    // Static disappearing-message clock badge in the footer / preview status row. No countdown.
    .disappearing-clock {
      display: inline-flex;
      align-items: center;
      color: var(--mc-message-indicator-label);

      @include def-var(--c-icon-font-size, var(--mc-message-indicator-icon-size));
    }

    // Static pin indicator on a pinned message, matching the footer indicator icons (F1Whisper fork).
    .pinned-icon {
      display: inline-flex;
      align-items: center;
      color: var(--mc-message-indicator-label);

      @include def-var(--c-icon-font-size, var(--mc-message-indicator-icon-size));
    }

    .text {
      @extend %font-normal-400;

      &.deleted {
        color: var(--t-text-e2-color);
        font-style: italic;
      }
    }

    .link-preview {
      display: flex;
      flex-direction: column;
      gap: rem(2px);
      margin-top: rem(8px);
      padding: rem(8px) rem(10px);
      border-radius: rem(10px);
      text-decoration: none;
      color: inherit;
      background-color: var(--mc-message-badge-background-color);
      border-left: var(--mc-message-quote-border-width) solid var(--t-color-primary);
      cursor: pointer;

      &:hover {
        background-color: var(--mc-message-quote-background-color--hover);
      }

      .domain {
        @extend %font-small-400;

        display: flex;
        align-items: center;
        gap: rem(4px);
        color: var(--t-text-anchor-color);

        @include def-var(--c-icon-font-size, #{rem(16px)});
      }

      .title {
        font-weight: bold;
        font-synthesis-weight: none;
      }

      .description {
        // Clamp long descriptions to keep the card compact.
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        overflow: hidden;
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

    // Collapsed note for a burned (consumed) listen-once voice message (F1Whisper fork). Replaces the
    // unplayable audio player with a small italic note plus the usual status row (timestamp/ticks).
    .burned-audio {
      @extend %font-small-400;

      display: flex;
      align-items: center;
      justify-content: space-between;
      min-width: 100%;
      gap: rem(8px);
      color: var(--mc-message-indicator-label);

      .note {
        display: flex;
        align-items: center;
        gap: rem(4px);
        font-style: italic;

        @include def-var(--c-icon-font-size, #{rem(16px)});
      }

      .status {
        @include def-var(--c-icon-font-size, var(--mc-message-indicator-icon-size));

        display: flex;
        align-items: center;
        gap: var(--mc-message-indicator-column-gap);
        color: var(--mc-message-indicator-label);
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

        .size {
          display: flex;
          align-items: center;
          gap: var(--mc-message-indicator-column-gap);

          .warning-icon {
            display: flex;
            color: var(--mc-message-file-error-color);
          }
        }

        .status {
          @include def-var(--c-icon-font-size, var(--mc-message-indicator-icon-size));
          @extend %font-small-400;

          display: flex;
          align-items: center;
          gap: var(--mc-message-indicator-column-gap);
          color: var(--mc-message-indicator-label);
        }
      }
    }

    .thumbnail {
      position: relative;
      border-radius: rem(10px);
      overflow: hidden;

      // Spoiler: blur the thumbnail until it is revealed. The blur sits on the image only, so the
      // reveal affordance stays crisp on top.
      &.spoiler-hidden {
        :global(img),
        :global(canvas) {
          filter: blur(rem(18px));
          transform: scale(1.1);
        }
      }

      .spoiler-reveal {
        @include clicktarget-button-rect;

        & {
          position: absolute;
          z-index: 1;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);

          display: flex;
          align-items: center;
          gap: rem(6px);
          padding: rem(6px) rem(12px);
          border-radius: rem(16px);
          color: var(--mc-message-overlay-button-color);
          background-color: var(--mc-message-overlay-button-background-color);

          @include def-var(--c-icon-font-size, #{rem(18px)});
        }
      }

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

          .warning-icon {
            display: flex;
            color: var(--mc-message-file-error-color);
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
