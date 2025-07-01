<!--
  @component Thumbnail used by the ScreenSharingPickerDialog component.
-->
<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {ScreenSharingPickerThumbnailProps} from '~/app/ui/components/partials/system-dialog/internal/screen-sharing-picker-dialog/internal/props';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  const {source, onselect}: ScreenSharingPickerThumbnailProps = $props();
</script>

<a
  class="container"
  href={undefined}
  onclick={() => {
    onselect(source.id);
  }}
>
  <!-- Electron supplies broken images for some thumbnails. -->
  {#if source.thumbnail !== 'data:image/png;base64,'}
    <img class="thumbnail" src={source.thumbnail} alt={source.name} />
  {:else}
    <div class="placeholder">
      <MdIcon theme="Outlined">broken_image</MdIcon>
    </div>
  {/if}
  <div class="footer">
    {#if !source.isScreen}
      <img class="icon" src={source.appIcon} alt={source.name} />
    {/if}
    <span class="label">
      <Text
        color="mono-high"
        family="secondary"
        ellipsis
        size="body"
        text={source.name}
        wrap={false}
      />
    </span>
  </div>
</a>

<style lang="scss">
  @use 'component' as *;

  .container {
    @include clicktarget-link-rect;

    & {
      width: rem(256px);

      background-color: var(--cc-screen-sharing-picker-dialog-thumbnail-background-color);
      border-radius: rem(8px);
      cursor: pointer;
      overflow: hidden;
      box-shadow: var(--cc-screen-sharing-picker-dialog-thumbnail-box-shadow);

      transition:
        transform 0.1s ease-in-out,
        box-shadow 0.1s ease-in-out,
        background-color 0.1s ease-in-out;
    }

    &:hover {
      background-color: var(--cc-screen-sharing-picker-dialog-thumbnail-background-color--hover);
      box-shadow: var(--cc-screen-sharing-picker-dialog-thumbnail-box-shadow--hover);
      transform: translateY(rem(-3px));
    }

    .thumbnail,
    .placeholder {
      width: 100%;

      aspect-ratio: 16 / 9;
      object-fit: contain;
      // Fix extra whitespace caused by `<img>`.
      vertical-align: middle;

      background-color: var(--cc-screen-sharing-picker-dialog-thumbnail-image-background-color);
    }

    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;

      font-size: rem(32px);
    }

    .footer {
      display: flex;
      align-items: center;
      justify-content: stretch;
      column-gap: rem(8px);

      padding: rem(8px);

      .icon {
        flex: 0 0 auto;

        width: rem(24px);
        height: rem(24px);
      }

      .label {
        flex: 0 1 auto;
        min-width: 0;

        line-height: rem(24px);
      }
    }
  }
</style>
