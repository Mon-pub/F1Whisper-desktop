<!--
  @component Renders a message quote.
-->
<script lang="ts">
  import LazyImage from '~/app/ui/components/atoms/lazy-image/LazyImage.svelte';
  import Prose from '~/app/ui/components/atoms/prose/Prose.svelte';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import FileInfo from '~/app/ui/components/molecules/message/internal/file-info/FileInfo.svelte';
  import QuotedAudio from '~/app/ui/components/molecules/message/internal/quote/internal/quoted-audio/QuotedAudio.svelte';
  import type {QuoteProps} from '~/app/ui/components/molecules/message/internal/quote/props';
  import Sender from '~/app/ui/components/molecules/message/internal/sender/Sender.svelte';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';

  const {
    alt,
    content,
    clickable = false,
    file,
    onclick,
    poll,
    sender,
    mode = 'quote',
  }: QuoteProps = $props();

  const buttonClass = $derived.by<string>(() => {
    const classes: string[] = [mode];
    if (file !== undefined) {
      classes.push(`${file.type}-container`);
    }
    if (mode === 'quote') {
      classes.push(`color-${sender?.color ?? 'default'}`);
    }

    return classes.join(' ');
  });

  // Spoiler reveal state for image/video thumbnails (F1Whisper fork), mirroring the bubble's own
  // spoiler treatment in `Message.svelte` for a consistent interaction: a spoiler-flagged quote
  // thumbnail is blurred until tapped; the first tap reveals it (and is swallowed via
  // `stopPropagation` so it does not also trigger the quote's own {onclick}, e.g. jumping to the
  // quoted message), a second tap behaves like any other quote click. Reveal state resets whenever
  // the underlying file changes (i.e. the quote is recycled for a different message).
  let spoilerRevealed = $state(false);
  $effect(() => {
    void file;
    spoilerRevealed = false;
  });

  const isSpoiler = $derived(
    file !== undefined && (file.type === 'image' || file.type === 'video') && file.spoiler === true,
  );
  const isSpoilerHidden = $derived(isSpoiler && !spoilerRevealed);

  function revealSpoiler(event: Pick<Event, 'preventDefault' | 'stopPropagation'>): void {
    if (!isSpoilerHidden) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    spoilerRevealed = true;
  }

  function handleThumbnailClick(event: MouseEvent): void {
    revealSpoiler(event);
  }

  // The reveal control is a `span` (not a nested `button`, which is invalid inside the quote's own
  // outer `<button>`), so it needs its own keyboard activation to stay reachable without a mouse.
  function handleSpoilerRevealKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      revealSpoiler(event);
    }
  }
</script>

<button class={buttonClass} class:captioned={content !== undefined} disabled={!clickable} {onclick}>
  {#if sender !== undefined && mode === 'quote'}
    <span class="sender">
      <Sender
        color={sender.color}
        messageHasThumbnail={file?.thumbnail !== undefined}
        name={sender.name}
      />
    </span>
  {:else if mode === 'edit'}
    <span class="title">
      <Text
        family="primary"
        selectable={true}
        size="body-small"
        text={$i18n.t('messaging.prose--edit-message', 'Edit Message')}
      />
    </span>
  {/if}

  {#if file !== undefined}
    {#if file.type === 'audio'}
      <span class="audio">
        <QuotedAudio {file} />
      </span>
    {:else if file.type === 'file'}
      <span class="file">
        <FileInfo
          mediaType={file.mediaType}
          name={file.name}
          sizeInBytes={file.sizeInBytes}
          disabled={!clickable}
        />
      </span>
    {:else if file.type === 'image' || file.type === 'video'}
      {#if file.thumbnail !== undefined}
        <span class="thumbnail" class:spoiler-hidden={isSpoilerHidden}>
          {#if file.type === 'video' && !isSpoilerHidden}
            <div class="play-icon">
              <MdIcon theme="Filled">play_arrow</MdIcon>
            </div>
          {/if}

          {#if isSpoilerHidden}
            <span
              class="spoiler-reveal"
              role="button"
              tabindex="0"
              onclick={handleThumbnailClick}
              onkeydown={handleSpoilerRevealKeydown}
              aria-label={$i18n.t('messaging.action--reveal-spoiler', 'Tap to reveal')}
              title={$i18n.t('messaging.action--reveal-spoiler', 'Tap to reveal')}
            >
              <MdIcon theme="Filled">visibility_off</MdIcon>
            </span>
          {/if}

          <LazyImage
            byteStore={file.thumbnail.thumbnailStore}
            constraints={{
              min: {
                width: 40,
                height: 40,
              },
              max: {
                width: 40,
                height: 40,
              },
            }}
            description={alt}
            dimensions={file.thumbnail.expectedDimensions}
            isClickable={clickable}
            isFocusable={clickable}
            onclick={handleThumbnailClick}
          />
        </span>
      {:else}
        <!-- If no thumbnail is given (which shouldn't happen in practice), simply don't render
        anything. -->
      {/if}
    {:else}
      {svelteUnreachable(file.type)}
    {/if}
  {/if}

  {#if content !== undefined}
    <div class="text">
      <Prose {content} wrap={true} selectable={true} />
    </div>
  {/if}

  {#if poll !== undefined}
    <div class="text">
      <Text
        text={`${$i18n.t('messaging.label--quote-poll-message', 'Poll')}: ${poll.description}`}
      />
    </div>
  {/if}
</button>

<style lang="scss">
  @use 'component' as *;

  .quote,
  .edit {
    @extend %neutral-input;
    text-align: start;

    position: relative;
    display: grid;
    grid-template:
      'title' min-content
      'preview' 1fr
      / auto;
    align-items: center;
    column-gap: rem(24px);
    row-gap: 0;
    min-height: rem(40px);
    padding-left: rem(10px);
    width: 100%;

    &.captioned {
      grid-template:
        'title preview' min-content
        'text preview' 1fr
        / auto min-content;

      &.audio-container,
      &.file-container {
        grid-template:
          'title' min-content
          'preview' 1fr
          'text' min-content
          / auto;
        row-gap: rem(4px);
      }

      .text {
        grid-area: text;
        display: flex;
        align-items: center;
        justify-content: start;
        color: var(--mc-message-quote-text-color);
      }
    }

    .thumbnail {
      position: relative;
      grid-area: preview;
      width: min-content;
      height: min-content;
      border-radius: rem(8px);
      overflow: hidden;

      .play-icon {
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
          pointer-events: none;
          display: flex;
          position: absolute;
          justify-content: center;
          align-items: center;
          color: var(--mc-message-overlay-button-color);
          background-color: var(--mc-message-overlay-button-background-color);
          width: rem(22px);
          height: rem(22px);
          left: calc(50% - rem(11px));
          top: calc(50% - rem(11px));
          font-size: rem(12px);
        }
      }

      // Spoiler: blur the thumbnail until it is revealed, mirroring `Message.svelte`'s bubble
      // treatment. The blur sits on the image only, so the reveal affordance stays crisp on top.
      &.spoiler-hidden {
        :global(img),
        :global(canvas) {
          filter: blur(rem(10px));
          transform: scale(1.1);
        }
      }

      .spoiler-reveal {
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
          z-index: 1;
          display: flex;
          position: absolute;
          justify-content: center;
          align-items: center;
          color: var(--mc-message-overlay-button-color);
          background-color: var(--mc-message-overlay-button-background-color);
          width: rem(22px);
          height: rem(22px);
          left: calc(50% - rem(11px));
          top: calc(50% - rem(11px));
          font-size: rem(12px);
        }
      }
    }

    .audio {
      grid-area: preview;
    }

    &:not(.captioned) {
      .thumbnail,
      .audio {
        margin: rem(4px) 0;
      }
    }

    &:not(:disabled),
    &:global(:not(:disabled) *) {
      cursor: pointer;
    }
  }

  .quote {
    &:before {
      content: '';
      position: absolute;
      display: block;
      left: 0;
      top: rem(5px);
      width: var(--mc-message-quote-border-width);
      height: calc(100% - rem(10px));
      border-radius: calc(var(--mc-message-quote-border-width) / 2);
      // Default quote bar is the same as the text color.
      background-color: var(--mc-message-quote-text-color);
    }

    .sender {
      grid-area: title;
      line-height: 1em;
    }
  }

  .edit {
    padding-left: 0;

    .title {
      grid-area: title;
      line-height: 1em;
    }
  }

  @each $color in map-get-req($config, profile-picture-colors) {
    .quote.color-#{$color} {
      &:before {
        background-color: var(--c-profile-picture-initials-#{$color}, default);
      }
    }
  }
</style>
