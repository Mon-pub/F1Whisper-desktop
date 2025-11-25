<script lang="ts">
  import {safedrag} from '~/app/ui/actions/drag';
  import type {DropZoneProviderProps} from '~/app/ui/components/hocs/drop-zone-provider/props';
  import {validateFiles} from '~/app/ui/utils/file';

  const {children, overlay, ondragover, ondropfiles}: DropZoneProviderProps = $props();

  let isDragOver = $state(false);

  async function handleDrop(event: DragEvent): Promise<void> {
    event.preventDefault();

    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles === undefined) {
      return;
    }

    const result = await validateFiles(droppedFiles);

    ondropfiles?.(result);
  }

  $effect(() => {
    ondragover?.(isDragOver);
  });
</script>

<div
  class="dropzone"
  use:safedrag
  onsafedragenter={() => {
    if (overlay !== undefined) {
      isDragOver = true;
    }
  }}
  onsafedragleave={() => {
    isDragOver = false;
  }}
  onsafedrop={handleDrop}
>
  {#if overlay !== undefined}
    <div class="overlay" class:active={isDragOver}>
      <div class="highlight">
        {overlay.message}
      </div>
    </div>
  {/if}

  {@render children?.()}
</div>

<style lang="scss">
  @use 'component' as *;

  .dropzone {
    position: relative;
    overflow: inherit;

    .overlay {
      z-index: $z-index-global-overlay;
      pointer-events: none;
      position: absolute;
      display: none;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      padding: rem(8px);
      background-color: var(--t-main-background-color);

      &.active {
        display: block;
      }

      .highlight {
        @extend %font-h5-400;

        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        border-radius: rem(8px);
        border: rem(2px) solid var(--cc-drop-zone-provider-border-color);
        background-color: var(--cc-drop-zone-provider-background-color);
      }
    }
  }
</style>
