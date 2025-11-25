<script lang="ts">
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {Packet, PacketFilter} from '~/app/ui/svelte-components/generic/PacketFlow';
  import type {u53} from '~/common/types';

  interface Props {
    /**
     * Filter function for packets. Defaults to display all packets.
     */
    readonly filter?: PacketFilter;
    /**
     * Packet layers packets may pass through.
     */
    readonly layers?: readonly string[];
    /**
     * The packets to be displayed.
     */
    readonly packets?: readonly Packet[];
    /**
     * The currently selected packet.
     */
    readonly selected?: Packet | undefined;
    /**
     * Start timestamp for displaying relative packet timestamps to.
     * Defaults to the timestamp of the first packet.
     */
    readonly startMs?: u53 | undefined;
  }

  let {
    filter = unfiltered,
    layers = [],
    packets = [],
    selected = $bindable(),
    startMs = $bindable(),
  }: Props = $props();

  // Default filter doesn't filter anything.
  function unfiltered(): boolean {
    return true;
  }

  // Run packets through the filter function.
  const filtered = $derived(
    packets.filter(
      (packet, index, array) => layers.includes(packet.layer) && filter(packet, index, array),
    ),
  );

  $effect(() => {
    // Determine the start timestamp, fall back to the first packet.
    startMs ??= packets[0]?.timestamp;
  });
</script>

<article style:--c-t-layers={layers.length}>
  <header>
    <span title="Direction (inbound or outbound)">IO</span>
    <span title="Time (in seconds)">Time</span>
    <!-- eslint-disable-next-line svelte/require-each-key -->
    {#each layers as layer}<span title={layer}>{layer}</span>{/each}
  </header>
  <!-- eslint-disable-next-line svelte/require-each-key -->
  {#each filtered as packet}
    <!-- Internal dev component, doesn't need to be accessible for now. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <section
      onclick={() => (selected = packet)}
      class:active={packet === selected}
      class:error={packet.error}
    >
      <span title={packet.direction}
        ><MdIcon theme="Filled">
          {packet.direction === 'inbound' ? 'chevron_right' : 'chevron_left'}
        </MdIcon>
      </span>
      <span>{((packet.timestamp - (startMs ?? 0)) / 1000).toFixed(2)}</span>
      <!-- eslint-disable-next-line svelte/require-each-key -->
      {#each layers as layer}
        {#if layer === packet.layer}<span>{packet.name}</span>{:else}<span></span>{/if}
      {/each}
    </section>
  {/each}
</article>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-t-layers);

  article {
    display: grid;
    grid-template-areas: 'direction time';
    grid-template-columns:
      auto
      minmax(em(40px), auto)
      repeat(var($-temp-vars, --c-t-layers), 1fr);
    gap: var(--c-packet-flow-gap, default);
    text-align: left;

    > * {
      min-height: 0;
    }

    header,
    section {
      display: contents;

      > * {
        padding: 0 em(4px);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        box-shadow: 0 0 0 var(--c-packet-flow-gap, default)
          var(--c-packet-flow-border-color, default);
        cursor: default;
      }

      :nth-child(1) {
        text-align: center;
        display: grid;
        place-items: center;
      }

      :nth-child(2) {
        text-align: right;
      }
    }

    header {
      font-weight: bold;
    }

    section {
      &:hover > * {
        background-color: var(--c-packet-flow-background-color--hover, default);
      }

      &.active > * {
        background-color: var(--c-packet-flow-background-color--active, default);
      }

      &.error > * {
        background-color: var(--c-packet-flow-background-color--error, default);
      }
    }
  }
</style>
