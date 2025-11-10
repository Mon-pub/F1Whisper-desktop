<!--
  @component Renders a preview of a video message blob.
-->
<script lang="ts">
  import type {VideoPreviewProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/internal/video-preview/props';

  let {element = $bindable(null), options = {}, oncontextmenu, video}: VideoPreviewProps = $props();
</script>

<!-- Ignore Svelte video captions warning, as video captions are not supported in the Threema
protocol. -->
<!-- svelte-ignore a11y_media_has_caption -->
<video
  bind:this={element}
  autoplay={options.autoplay ?? true}
  controls
  controlslist={options.controlslist ?? 'nodownload'}
  data-sizing-behavior={options.sizingBehavior ?? 'scale'}
  loop={options.loop ?? true}
  {oncontextmenu}
  src={video.url}
></video>

<style lang="scss">
  @use 'component' as *;

  video {
    @extend %elevation-160;
    grid-area: 1 / 1;
    border-radius: rem(8px);
    display: block;
    object-fit: contain;

    &[data-sizing-behavior='scale'] {
      min-width: rem(160px);
      min-height: rem(160px);
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
    }

    &[data-sizing-behavior='stretch'] {
      width: 100%;
      height: 100%;
    }

    &:focus-visible {
      outline: none;
    }
  }
</style>
