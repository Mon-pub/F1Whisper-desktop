<script lang="ts">
  import type {Readable} from 'svelte/store';

  import type {AppServicesForSvelte} from '~/app/types';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import ByteView from '~/app/ui/svelte-components/generic/ByteView/ByteView.svelte';
  import type {TreeExpandDetail, TreeItem} from '~/app/ui/svelte-components/generic/ObjectTree';
  import ObjectTree from '~/app/ui/svelte-components/generic/ObjectTree/ObjectTree.svelte';
  import type {Packet} from '~/app/ui/svelte-components/generic/PacketFlow/';
  import PacketFlow from '~/app/ui/svelte-components/generic/PacketFlow/PacketFlow.svelte';
  import {LAYERS} from '~/common/network/protocol/capture';
  import {assert} from '~/common/utils/assert';

  interface Props {
    services: AppServicesForSvelte;
  }

  const {services}: Props = $props();

  // Unpack services.
  const {backend} = services;

  // Packets to be displayed.
  const packets: Readable<readonly Packet[]> | undefined = backend.capturing?.packets;
  // Currently selected packet to be introspected.
  let selected = $state<Packet | undefined>(undefined);

  function showBytes(detail: TreeExpandDetail): void {
    if (!(detail.object instanceof Uint8Array)) {
      throw new Error('Expected bytes in expand event');
    }
    assert(current !== undefined, 'Expected selected packet to be defined when expanding');
    current.bytes = detail.object;
  }

  async function capture(): Promise<void> {
    await backend.capture();
  }

  // Currently selected packet's error, object and bytes to be displayed.
  const current = $derived<
    | {
        error?: string;
        object?: TreeItem;
        bytes?: Uint8Array;
      }
    | undefined
  >({
    // Display any error associated to the selected packet.
    error: selected?.error,
    // Display the selected payload's object, if any.
    object: !(selected?.payload instanceof Uint8Array) ? selected?.payload : undefined,
    // Display the selected payload's bytes, if any. Note that `bytes` gets
    // overridden in case a child byte element has been selected in which case
    // `showBytes` fires.
    bytes: selected?.payload instanceof Uint8Array ? selected.payload : undefined,
  });
</script>

<template>
  {#if packets === undefined}
    <section data-capture="inactive">
      <Button flavor="filled" onclick={capture}>
        <span class="icon-and-text"
          ><MdIcon theme="Filled">fiber_manual_record</MdIcon>
          Capture</span
        >
      </Button>
      <span class="icon-and-text">
        <MdIcon theme="Outlined">info</MdIcon>
        Enabling capture will trigger a reconnect.</span
      >
    </section>
  {:else}
    <section data-capture="active">
      <div class="packets">
        <PacketFlow layers={LAYERS} packets={$packets} bind:selected />
      </div>
      <div class="wrapper">
        {#if current?.error !== undefined}
          <div class="error">{current.error}</div>
        {/if}
        <div class="introspection">
          {#if current?.object !== undefined}
            <div class="object">
              <ObjectTree
                external={['Uint8Array']}
                limit={16}
                object={current.object}
                onexpand={showBytes}
              />
            </div>
          {/if}
          {#if current?.bytes !== undefined}
            <div class="bytes">
              <div class="content">
                <ByteView bytes={current.bytes} limit={16} />
              </div>
              <div class="length">{current.bytes.byteLength} Byte</div>
            </div>
          {/if}
        </div>
      </div>
    </section>
  {/if}
</template>

<style lang="scss">
  @use 'component' as *;

  [data-capture='inactive'] {
    padding: rem(8px);
    display: grid;
    gap: rem(8px);
    place-items: center;
    grid-auto-flow: row;

    .icon-and-text {
      display: flex;
      gap: rem(4px);
      place-items: center;
    }
  }

  [data-capture='active'] {
    height: 100%;
    display: grid;
    grid: repeat(2, 1fr) / auto;

    > * {
      box-shadow: 0 rem(1px) 0 rem(1px) var(--c-packet-flow-border-color);
      overflow-x: auto;
      overflow-y: scroll;
    }

    .wrapper {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .error {
      flex-basis: auto;
      padding: 0 rem(4px);
      color: var(--c-packet-flow-background-color--error);
      box-shadow: 0 rem(1px) 0 rem(1px) var(--c-packet-flow-border-color);
    }

    .introspection {
      flex-grow: 1;
      display: flex;
      flex-wrap: wrap;

      > * {
        flex: 1 0 50%;
        box-shadow: 0 rem(1px) 0 rem(1px) var(--c-packet-flow-border-color);
      }

      .bytes {
        display: flex;
        justify-content: space-between;

        .length {
          font-family: monospace;
          writing-mode: vertical-lr;
        }
      }
    }
  }
</style>
