<script lang="ts">
  import {i18n} from '~/app/ui/i18n';
  import {EMOJI_LIST} from '~/app/ui/linking/emoji-list';
  import type {u8, u53} from '~/common/types';
  import {joinConstArray} from '~/common/utils/array';
  import {literalToLowercase} from '~/common/utils/string';

  interface Props {
    /**
     * A single byte that should be mapped to an emoji.
     */
    readonly byte: u8;
  }

  const {byte}: Props = $props();

  // Note: The number of source emoji should be a factor of 256 (i.e. 256, 128, 64, ...) so that
  //       they uniformly distribute over the possible byte values without bias.
  const emojis = EMOJI_LIST.map(
    (codepoints) =>
      ({
        codepoint: joinConstArray(codepoints, '_'),
        label: `rendezvous-emoji.label--${literalToLowercase(joinConstArray(codepoints, '-'))}`,
      }) as const,
  );

  const {url, description} = $derived.by<{
    readonly url: `./res/linking-emoji/emoji_${(typeof emojis)[u53]['codepoint']}.svg` | undefined;
    readonly description: string | undefined;
  }>(() => {
    const emoji = emojis[byte % EMOJI_LIST.length];
    if (emoji !== undefined) {
      return {
        url: `./res/linking-emoji/emoji_${emoji.codepoint}.svg`,
        description: $i18n.t(emoji.label),
      };
    }

    return {url: undefined, description: undefined};
  });
</script>

{#if url !== undefined}
  <img class="emoji" src={url} alt={description} title={description} />
{/if}
