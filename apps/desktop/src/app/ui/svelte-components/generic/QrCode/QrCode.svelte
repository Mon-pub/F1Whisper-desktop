<script lang="ts">
  import type * as qr from 'qrcode';

  import {drawToCanvas} from '~/app/ui/svelte-components/generic/QrCode';
  import {assertUnreachable} from '~/common/utils/assert';

  interface Props {
    /**
     * Data to be encoded.
     */
    readonly data: string | Uint8Array;
    /**
     * Encoding options for drawing the QR code.
     */
    readonly options?: qr.QRCodeRenderersOptions | undefined;
  }

  const {data, options}: Props = $props();

  // The canvas to draw the QR code on.
  let canvas: HTMLCanvasElement | null = $state(null);

  $effect(() => {
    if (canvas !== null) {
      drawToCanvas(canvas, data, options).catch(assertUnreachable);
    }
  });
</script>

<canvas bind:this={canvas}></canvas>
