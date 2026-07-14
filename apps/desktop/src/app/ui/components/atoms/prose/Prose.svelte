<!--
  @component Renders longer snippets of text.
-->
<script lang="ts">
  import type {ProseProps} from '~/app/ui/components/atoms/prose/props';
  import {hasProperty} from '~/common/utils/object';
  import {truncate} from '~/common/utils/string';

  const {content, options = {}, selectable = false, wrap = true}: ProseProps = $props();

  // Spoiler tap-to-reveal. As the formatted content is injected via `{@html}` (which is inert), we
  // use a single delegated click/keyboard handler on the container and toggle a `revealed` class on
  // the tapped `.md-spoiler` span. Reveal state lives in the DOM (the class), so it naturally resets
  // whenever the content changes (i.e. on conversation change, the component is re-rendered).
  function handleSpoilerActivation(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    // Spoilers in preview contexts (conversation list / notifications) are non-interactive.
    const spoiler = target.closest('.md-spoiler:not(.preview)');
    if (spoiler !== null) {
      spoiler.classList.toggle('revealed');
    }
  }

  function handleClick(event: MouseEvent): void {
    handleSpoilerActivation(event.target);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target;
      if (target instanceof HTMLElement && target.classList.contains('md-spoiler')) {
        event.preventDefault();
        handleSpoilerActivation(target);
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<span class="prose" class:wrap class:selectable onclick={handleClick} onkeydown={handleKeydown}>
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
