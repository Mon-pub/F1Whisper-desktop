<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import Slider from '~/app/ui/components/atoms/slider/Slider.svelte';
  import type {EditPictureCanvasProps} from '~/app/ui/components/partials/modals/edit-picture-modal/internal/edit-picture-canvas/props';
  import {i18n} from '~/app/ui/i18n';
  import {
    PROFILE_PICTURE_DOWNSIZE_QUALITY,
    PROFILE_PICTURE_EXPORT_SIZE,
  } from '~/app/ui/utils/constants';
  import type {ProfilePictureBlobStoreValue} from '~/common/dom/ui/profile-picture';
  import {isF64, isI53, type f64, type i53} from '~/common/types';
  import {ensureError} from '~/common/utils/assert';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.edit-picture-modal');

  const {profilePictureStore, ondirty}: EditPictureCanvasProps = $props();

  const overlayGap = 0.2;

  let canvas = $state<HTMLCanvasElement>();
  let degree = $state<i53>(0);
  let scale = $state<f64>(1);
  let minScale = $state<f64>(0.01);
  const maxScale = 3;

  let bitmapWidth = 0;
  let bitmapHeight = 0;

  let offsetX = 0;
  let offsetY = 0;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  /**
   * This method creates a Blob object representing the image contained in the canvas. The type is
   * fixed to `'image/jpeg'`.
   */
  export async function getBlob(): Promise<Blob | undefined> {
    if ($profilePictureStore === undefined) {
      log.warn('Profile picture store is not available. Abort');
      return undefined;
    }

    const bitmap = await createImageBitmap($profilePictureStore.blob);

    const offCanvas = new OffscreenCanvas(PROFILE_PICTURE_EXPORT_SIZE, PROFILE_PICTURE_EXPORT_SIZE);
    const offCtx = offCanvas.getContext('2d');

    if (offCtx === null) {
      log.warn('Could not get offscreen canvas context');
      return undefined;
    }

    const logicalExportSize = Math.min(canvasWidth, canvasHeight) / (1 + overlayGap);
    const normalizationScale = PROFILE_PICTURE_EXPORT_SIZE / logicalExportSize;

    // Final scale combines zoom and normalization.
    const finalScale = scale * normalizationScale;

    // Center the export based on current transforms (matching main canvas).
    offCtx.setTransform(
      finalScale,
      0,
      0,
      finalScale,
      PROFILE_PICTURE_EXPORT_SIZE / 2 + offsetX * normalizationScale,
      PROFILE_PICTURE_EXPORT_SIZE / 2 + offsetY * normalizationScale,
    );
    offCtx.rotate(rotation);

    offCtx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap.close();

    return await offCanvas.convertToBlob({
      type: 'image/jpeg',
      quality: PROFILE_PICTURE_DOWNSIZE_QUALITY,
    });
  }

  async function setProfilePicture(profilePicture: ProfilePictureBlobStoreValue): Promise<void> {
    if (ctx === undefined) {
      log.warn('2d rendering context is not available. Abort');
      return;
    }

    if (profilePicture !== undefined) {
      const bitmap = await createImageBitmap(profilePicture.blob);
      bitmapWidth = bitmap.width;
      bitmapHeight = bitmap.height;

      // Reset transforms.
      offsetX = 0;
      offsetY = 0;
      degree = 0;

      // Compute initial scale to fit image inside canvas.
      const exportSize = Math.min(canvasWidth, canvasHeight);
      const scaleX = exportSize / bitmap.width;
      const scaleY = exportSize / bitmap.height;
      scale = Math.max(scaleX, scaleY);

      // Compute minimum scale needed to fully cover the overlay.
      const overlayRadius = exportSize / (2 + 2 * overlayGap);
      const minScaleX = (overlayRadius * 2) / bitmap.width;
      const minScaleY = (overlayRadius * 2) / bitmap.height;
      minScale = Math.max(minScaleX, minScaleY);

      await renderImage();
      bitmap.close();
    } else {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    }
  }

  async function onscale(value: Event | f64): Promise<void> {
    const newScale = isF64(value) ? value : parseFloat((value.target as HTMLSelectElement).value);

    if (newScale >= minScale && newScale <= maxScale) {
      const prevScale = scale;
      scale = newScale;

      // Adjust the offsets based on the scale change.
      const scaleFactor = scale / prevScale;

      // Adjust offsets to keep the image centered.
      offsetX *= scaleFactor;
      offsetY *= scaleFactor;

      // Constrain the offsets to the overlay boundaries after scaling.
      constrainOffsets();
      await renderImage();
      ondirty();
    }
  }

  async function onrotate(value: Event | i53): Promise<void> {
    degree = isI53(value) ? value : parseInt((value.target as HTMLSelectElement).value, 10);

    // Constrain the offsets after the rotation.
    constrainOffsets();
    await renderImage();
    ondirty();
  }

  function onmousedown(event: MouseEvent): void {
    isDragging = true;
    dragStartX = event.offsetX;
    dragStartY = event.offsetY;
  }

  async function onmousemove(event: MouseEvent): Promise<void> {
    if (!isDragging) {
      return;
    }

    const dx = event.offsetX - dragStartX;
    const dy = event.offsetY - dragStartY;

    // Update the offsets.
    offsetX += dx;
    offsetY += dy;

    // Constrain the offsets after dragging.
    constrainOffsets();

    // Update the drag start position for the next movement.
    dragStartX = event.offsetX;
    dragStartY = event.offsetY;

    await renderImage();
    ondirty();
  }

  function onmouseup(): void {
    isDragging = false;
  }

  function onmouseleave(): void {
    isDragging = false;
  }

  async function onwheel(event: WheelEvent): Promise<void> {
    await onscale(scale - 0.001 * event.deltaY);
  }

  async function renderImage(): Promise<void> {
    if (ctx === undefined) {
      log.warn('2d rendering context is not available. Abort');
      return;
    }

    if ($profilePictureStore === undefined) {
      log.warn('Profile picture store is not available. Abort');
      return;
    }

    const bitmap = await createImageBitmap($profilePictureStore.blob);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw the image with current transforms.
    ctx.setTransform(scale, 0, 0, scale, canvasWidth / 2 + offsetX, canvasHeight / 2 + offsetY);
    ctx.rotate(rotation);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    // Cleanup and reset transform.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    bitmap.close();

    // Dim the entire canvas.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, canvasHeight);

    // Create a circular "hole" in the middle.
    const radius = Math.min(canvasWidth, canvasHeight) / (2 + 2 * overlayGap);
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
    ctx.fill('evenodd'); // Use evenodd to create the transparent hole.

    // Draw label with hint.
    ctx.font = '200 14px Open Sans';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText(
      $i18n.t('dialog--edit-profile-picture.hint--drag-image', 'Drag to reposition photo'),
      canvasWidth / 2,
      30,
    );
  }

  function constrainOffsets(): void {
    const halfSide = Math.min(canvasWidth, canvasHeight) / (2 + 2 * overlayGap);
    const isQuarterTurn = Math.abs(degree % 180) === 90;

    // Calculate the effective width and height after rotation and scaling.
    const effectiveWidth = isQuarterTurn ? bitmapHeight * scale : bitmapWidth * scale;
    const effectiveHeight = isQuarterTurn ? bitmapWidth * scale : bitmapHeight * scale;

    // Calculate the maximum allowable offset.
    const maxOffsetX = effectiveWidth / 2 - halfSide;
    const maxOffsetY = effectiveHeight / 2 - halfSide;

    // Constrain the offsetX and offsetY within the bounds of the overlay.
    offsetX = Math.max(-maxOffsetX, Math.min(offsetX, maxOffsetX));
    offsetY = Math.max(-maxOffsetY, Math.min(offsetY, maxOffsetY));
  }

  const ctx = $derived(canvas?.getContext('2d') ?? undefined);
  const canvasWidth = $derived(canvas?.width ?? 0);
  const canvasHeight = $derived(canvas?.height ?? 0);
  const rotation = $derived((degree * Math.PI) / 180);

  $effect(() => {
    setProfilePicture($profilePictureStore).catch((error: unknown) => {
      log.error('Setting profile picture failed: ', ensureError(error));
    });
  });

  onMount(() => {
    canvas?.addEventListener('wheel', onwheel, {passive: true});

    return () => {
      canvas?.removeEventListener('wheel', onwheel);
    };
  });
</script>

<div class="container">
  <div class="canvas-wrapper">
    <canvas
      class="canvas"
      width={800}
      height={600}
      bind:this={canvas}
      {onmousedown}
      {onmousemove}
      {onmouseup}
      {onmouseleave}
    ></canvas>
  </div>

  <div class="controls">
    <Slider
      iconLeft="check_indeterminate_small"
      iconRight="add"
      min={minScale}
      max={maxScale}
      step={0.01}
      value={scale}
      oninput={onscale}
      onclickleft={async () => {
        await onscale(scale - 0.01);
      }}
      onclickright={async () => {
        await onscale(scale + 0.01);
      }}
    />
    <Slider
      iconLeft="rotate_90_degrees_ccw"
      iconRight="rotate_90_degrees_cw"
      min={-180}
      max={180}
      step={90}
      value={degree}
      oninput={onrotate}
      onclickleft={async () => {
        await onrotate(degree - 90);
      }}
      onclickright={async () => {
        await onrotate(degree + 90);
      }}
    />
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    grid-template:
      'canvas' 1fr
      'controls' min-content /
      1fr;

    width: 100%;
    height: 100%;
    overflow: hidden;

    .canvas-wrapper {
      width: 100%;
      height: 100%;
      overflow: hidden;

      .canvas {
        width: 100%;
        height: 100%;
        aspect-ratio: 800 / 600;
        object-fit: contain;

        background-color: black;
      }
    }

    .controls {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }
</style>
