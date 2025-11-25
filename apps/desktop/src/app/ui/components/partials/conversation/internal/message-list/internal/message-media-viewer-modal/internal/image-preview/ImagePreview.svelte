<!--
  @component Renders a full-size image preview of an image message blob.
-->
<script lang="ts">
  import type {ImagePreviewProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/internal/image-preview/props';
  import {i18n} from '~/app/ui/i18n';

  let {element = $bindable(), image, oncontextmenu}: ImagePreviewProps = $props();
</script>

<img
  bind:this={element}
  alt={$i18n.t('dialog--media-message-viewer.hint--full-size-preview', 'Full-size preview')}
  {oncontextmenu}
  src={image.url}
/>

<style lang="scss">
  @use 'component' as *;

  img {
    @extend %elevation-160;

    grid-area: 1 / 1;
    border-radius: rem(8px);
    display: block;
    object-fit: contain;
    min-width: rem(16px);
    min-height: rem(16px);
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    background-color: rgba(var(--cc-modal-dialog-background-color-rgb-triplet), 1);
  }
</style>
