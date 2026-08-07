<!--
  @component Renders longer snippets of text.
-->
<script lang="ts">
  import type {ProseProps} from '~/app/ui/components/atoms/prose/props';
  import {i18n} from '~/app/ui/i18n';
  import {computeSpoilerAriaState} from '~/app/ui/utils/text';
  import {hasProperty} from '~/common/utils/object';
  import {truncate} from '~/common/utils/string';

  const {content, options = {}, selectable = false, wrap = true}: ProseProps = $props();

  // Spoiler tap-to-reveal. As the formatted content is injected via `{@html}` (which is inert), we
  // use a single delegated click/keyboard handler on the container and add a `revealed` class to
  // the tapped `.md-spoiler` span. Reveal state lives in the DOM (the class), so it naturally resets
  // whenever the content changes (i.e. on conversation change, the component is re-rendered).
  //
  // The concealed text itself lives in a nested `.md-spoiler-content` span that starts
  // `aria-hidden="true"` (set by `text.ts`) so assistive tech never announces it before reveal. On
  // reveal, mirror the visual state into the accessibility tree: flip that `aria-hidden`, keep
  // `aria-expanded` in sync, and remove the control's `aria-label` so a concealed spoiler announces a
  // localized "tap to reveal" hint while a revealed one falls back to announcing its now-visible
  // content instead. The actual state DECISION is `computeSpoilerAriaState`, a pure function in
  // `text.ts` -- this handler is just the thin DOM-applying adapter, so the decision logic itself is
  // unit-testable without a browser or component mount.
  function revealConcealedSpoiler(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    // Spoilers in preview contexts (conversation list / notifications) are non-interactive.
    const spoiler = target.closest('.md-spoiler:not(.preview)');
    if (spoiler === null || spoiler.classList.contains('revealed')) {
      return false;
    }
    spoiler.classList.add('revealed');
    const state = computeSpoilerAriaState(
      true,
      $i18n.t('messaging.action--reveal-spoiler', 'Tap to reveal'),
    );
    spoiler.setAttribute('aria-expanded', state.controlAriaExpanded);
    if (state.controlAriaLabel === undefined) {
      spoiler.removeAttribute('aria-label');
    } else {
      spoiler.setAttribute('aria-label', state.controlAriaLabel);
    }
    spoiler
      .querySelector('.md-spoiler-content')
      ?.setAttribute('aria-hidden', state.contentAriaHidden);
    return true;
  }

  function handleClick(event: MouseEvent): void {
    // The first activation only reveals the concealed content. Swallow it so a nested link or the
    // surrounding clickable message cannot also activate. Once revealed, later clicks are left
    // untouched and proceed normally.
    if (revealConcealedSpoiler(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target;
      if (target instanceof HTMLElement && target.classList.contains('md-spoiler')) {
        if (revealConcealedSpoiler(target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  }

  function getTruncatedText(currentText: string): string {
    if (options.truncate === undefined) {
      return currentText;
    }

    if (options.truncate.type !== 'around') {
      return truncate(currentText, options.truncate.max, options.truncate.type);
    }

    if (options.truncate.focuses !== undefined) {
      return truncate(
        currentText,
        options.truncate.max,
        options.truncate.type,
        options.truncate.focuses,
        'both',
      );
    }

    return truncate(currentText, options.truncate.max, 'both');
  }
</script>

<span
  class="prose"
  class:wrap
  class:selectable
  onclickcapture={handleClick}
  onkeydowncapture={handleKeydown}
>
  {#if hasProperty(content, 'sanitizedHtml')}
    <!-- As text is expected to be escaped, `no-at-html-tags` can be ignored. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html content.sanitizedHtml}
  {:else}
    <!-- eslint-disable-next-line @typescript-eslint/no-unsafe-argument -->
    {getTruncatedText(content.text)}
  {/if}
</span>

<style lang="scss">
  @use 'component' as *;

  .prose {
    &.wrap {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    &.selectable {
      user-select: text;
    }

    :global(.md-bold) {
      @extend %markup-bold;
    }

    :global(.md-italic) {
      @extend %markup-italic;
    }

    :global(.md-strike) {
      @extend %markup-strike;
    }

    :global(.md-code) {
      @extend %markup-code;
    }

    :global(.md-spoiler) {
      @extend %markup-spoiler;
    }

    :global(.md-spoiler.revealed) {
      @extend %markup-spoiler-revealed;
    }

    :global(.mention) {
      @extend %mention;
    }

    :global(.mention.me) {
      @extend %mention-me;
    }

    :global(.mention.all) {
      @extend %mention-all;
    }

    :global(.mention ~ .mention) {
      margin-left: rem(4px);
    }

    :global(.highlight-subtext) {
      @extend %highlight-subtext;
    }
  }
</style>
