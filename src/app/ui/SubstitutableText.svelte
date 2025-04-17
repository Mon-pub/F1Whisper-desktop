<script lang="ts">
  import type {Snippet} from 'svelte';

  import {globals} from '~/app/globals';
  import type {u53} from '~/common/types';
  import {assertUnreachable, unreachable, unwrap} from '~/common/utils/assert';

  const log = globals.unwrap().uiLogging.logger('ui.component.substitutable-text');

  interface Props {
    /* eslint-disable @typescript-eslint/naming-convention */
    readonly slot_1?: Snippet<[text: string | undefined]>;
    readonly slot_2?: Snippet<[text: string | undefined]>;
    readonly slot_3?: Snippet<[text: string | undefined]>;
    /* eslint-enable @typescript-eslint/naming-convention */
    readonly text: string | undefined;
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const {slot_1, slot_2, slot_3, text}: Props = $props();

  // For now there are no instances of needing more than 3 different tags in a text. We can add more
  // if needed.
  const ALLOWED_TAGS = ['slot_1', 'slot_2', 'slot_3'] as const;
  type AllowedTag = (typeof ALLOWED_TAGS)[u53];

  function isAllowedTag(tag: string | undefined): tag is AllowedTag {
    if (tag === undefined) {
      return false;
    }
    return (ALLOWED_TAGS as readonly string[]).includes(tag);
  }

  const ALLOWED_TAGS_UNION = `(${ALLOWED_TAGS.join('|')})`;
  const SELF_CLOSING_TAG_PATTERN = `<(?<selfClosingTag>${ALLOWED_TAGS_UNION}) ?/>` as const;
  const TAG_PATTERN = `<(?<tag>${ALLOWED_TAGS_UNION})>(?<text>.*?)</\\k<tag>>` as const;
  const PLAIN_TEXT_PATTERN = `(?<plain>(?:.+?(?=<${ALLOWED_TAGS_UNION}(?: ?/)?>)|.+$))` as const;

  // eslint-disable-next-line threema/ban-stateful-regex-flags
  const TAG_SPLITTER_REGEX = new RegExp(
    [SELF_CLOSING_TAG_PATTERN, TAG_PATTERN, PLAIN_TEXT_PATTERN].join('|'),
    'gum',
  );

  type Fragment =
    | {readonly type: 'plain'; readonly text: string}
    | {readonly type: 'tag'; readonly tag: AllowedTag; readonly text: string}
    | {readonly type: 'selfClosingTag'; readonly tag: AllowedTag; readonly text: undefined};

  const providedSlots = $derived({
    /* eslint-disable @typescript-eslint/naming-convention */
    slot_1,
    slot_2,
    slot_3,
    /* eslint-enable @typescript-eslint/naming-convention */
  });

  function warnMissingSlot(tag: AllowedTag): void {
    log.warn(
      `Text "${text}" expects a child slot with \`name="${tag}"\` but it has not been provided.`,
    );
  }

  function warnUnusedSlots(newFragments: Fragment[]): void {
    const expectedTags = new Set(
      newFragments
        .map((fragment) => (fragment.type === 'plain' ? '' : fragment.tag))
        .filter(isAllowedTag),
    );
    for (const tag of ALLOWED_TAGS) {
      if (providedSlots[tag] !== undefined && !expectedTags.has(tag)) {
        log.warn(`Unused child slot with \`name="${tag}"\` for text "${text}".`);
      }
    }
  }

  const fragments = $derived(
    text === undefined
      ? []
      : [...text.matchAll(TAG_SPLITTER_REGEX)].map<Fragment>((match) => {
          const matchedText = match[0];
          const {groups} = match;

          if (groups === undefined) {
            return assertUnreachable('TAG_SPLITTER_REGEX should have returned a matched group');
          }

          if (groups.plain !== undefined) {
            return {
              type: 'plain',
              text: groups.plain,
            };
          }

          if (isAllowedTag(groups.tag)) {
            const tagText = unwrap(groups.text);
            if (providedSlots[groups.tag] !== undefined) {
              return {
                type: 'tag',
                tag: groups.tag,
                text: tagText,
              };
            }
            warnMissingSlot(groups.tag);
            return {
              type: 'plain',
              text: import.meta.env.DEBUG ? matchedText : tagText,
            };
          }

          if (isAllowedTag(groups.selfClosingTag)) {
            if (providedSlots[groups.selfClosingTag] !== undefined) {
              return {
                type: 'selfClosingTag',
                tag: groups.selfClosingTag,
              };
            }
            warnMissingSlot(groups.selfClosingTag);
            return {
              type: 'plain',
              text: import.meta.env.DEBUG ? matchedText : '',
            };
          }

          return assertUnreachable(`Unexpected matching by TAG_SPLITTER_REGEX on '${matchedText}'`);
        }),
  );

  $effect(() => warnUnusedSlots(fragments));
</script>

<template>
  {#each fragments as fragment (fragment)}
    {#if fragment.type === 'plain'}
      {fragment.text}
    {:else if fragment.type === 'tag' || fragment.type === 'selfClosingTag'}
      {#if fragment.tag === 'slot_1'}
        {@render slot_1?.(fragment.text)}
      {:else if fragment.tag === 'slot_2'}
        {@render slot_2?.(fragment.text)}
      {:else if fragment.tag === 'slot_3'}
        {@render slot_3?.(fragment.text)}
      {:else}
        {unreachable(fragment.tag)}
      {/if}
    {:else}
      {unreachable(fragment)}
    {/if}
  {/each}
</template>
