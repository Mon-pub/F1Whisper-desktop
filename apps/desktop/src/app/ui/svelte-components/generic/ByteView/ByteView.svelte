<script lang="ts">
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {parse, type ParsedBytes} from '~/app/ui/svelte-components/generic/ByteView';
  import {limited, type LimitedArray} from '~/app/ui/svelte-components/utils/array';
  import type {u53} from '~/common/types';

  interface Props {
    /**
     * Bytes to be displayed.
     */
    bytes: Uint8Array;
    /**
     * Maximum amount of byte rows (each row containing up to 16 bytes) to be displayed at once. The
     * user can expand the rows by a click on the `...` button.
     */
    limit?: u53;
  }

  const {bytes, limit = Number.POSITIVE_INFINITY}: Props = $props();

  // Parse the bytes into rows of 16 bytes.
  const parsed = $derived<readonly ParsedBytes[]>(parse(bytes));
  let limiter = $state<u53>(limit);
  // Limit the amount of rows displayed at once.
  const rows = $derived<LimitedArray<ParsedBytes>>(limited(parsed, limiter));
</script>

<article>
  <!-- eslint-disable-next-line svelte/require-each-key -->
  {#each rows.items as [offset, byteRepresentations]}
    <section>
      <span class="offset">{offset}</span>
      <span class="hex">
        <!-- eslint-disable-next-line svelte/require-each-key -->
        {#each byteRepresentations as [hex]}<span class="value">{hex}</span>{/each}
      </span>
      <span class="ascii">
        <!-- eslint-disable-next-line svelte/require-each-key -->
        {#each byteRepresentations as [_, ascii]}{ascii}{/each}
      </span>
    </section>
  {/each}
  {#if rows.limited}
    <section>
      <!-- Internal dev component, doesn't need to be accessible for now. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="expand"
        title="Show all"
        onclick={() => {
          limiter = Number.POSITIVE_INFINITY;
        }}
      >
        <MdIcon theme="Filled">expand_more</MdIcon>
      </span>
    </section>
  {/if}
</article>

<style lang="scss">
  @use 'component' as *;

  article {
    display: grid;
    gap: var(--c-byte-view-gap, default);
    grid-template:
      'value offset expand'
      / min-content min-content min-content;
    font-family: var(--c-byte-view-font-family, default);
    text-align: left;

    > * {
      min-height: 0;
    }

    section {
      display: contents;

      > * {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .value {
        padding: 0 em(2px);
      }

      .offset {
        background-color: var(--c-byte-view-offset-background-color, default);
      }

      .expand {
        text-align: center;
        cursor: pointer;
      }
    }
  }
</style>
