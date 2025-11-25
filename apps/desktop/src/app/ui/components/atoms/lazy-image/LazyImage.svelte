<!--
  @component Renders an image whose bytes might be provided later, or a placeholder.
-->
<script lang="ts">
  import {onDestroy, untrack} from 'svelte';

  import {constrain} from '~/app/ui/components/atoms/lazy-image/constrain';
  import type {LazyImageProps} from '~/app/ui/components/atoms/lazy-image/props';
  import type {LazyImageContent} from '~/app/ui/components/atoms/lazy-image/types';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {svelteUnreachable} from '~/app/ui/utils/svelte';
  import {assertUnreachable} from '~/common/utils/assert';
  import {isSupportedImageType} from '~/common/utils/image';

  const {
    byteStore,
    constraints,
    description,
    dimensions = undefined,
    isClickable = false,
    isFocusable = false,
    onclick,
    responsive = false,
    snippetFailed,
    snippetLoading,
  }: LazyImageProps = $props();

  let image = $state<LazyImageContent>({
    state: 'loading',
  });

  async function updateContent(
    currentByteStoreValue: typeof $byteStore | undefined,
  ): Promise<void> {
    untrack(() => revokeCurrentImageUrl(image));

    if (currentByteStoreValue === 'loading') {
      image = {state: 'loading'};
      return;
    }

    if (currentByteStoreValue === undefined) {
      image = {state: 'failed'};
      return;
    }

    // At this point it's certain that `value` contains a blob with precalculated dimensions.
    const blob = currentByteStoreValue.blob;

    // If the blob is an unsupported image type (e.g., an SVG), don't render it at all.
    if (!isSupportedImageType(blob.type)) {
      image = {state: 'failed'};
      return;
    }

    // Use the precalculated information to create the image.
    untrack(() => revokeCurrentImageUrl(image));
    image = {
      state: 'loaded',
      url: URL.createObjectURL(blob),
      dimensions: {
        width: currentByteStoreValue.dimensions.width,
        height: currentByteStoreValue.dimensions.height,
      },
    };
  }

  function revokeCurrentImageUrl(currentImage: LazyImageContent): void {
    if (currentImage.state === 'loaded') {
      URL.revokeObjectURL(currentImage.url);
    }
  }

  const preferredDisplay = $derived(
    constrain({
      dimensions:
        image.state === 'loaded' ? image.dimensions : (dimensions ?? {width: 0, height: 0}),
      constraints,
    }),
  );
  const preferredAspectRatio = $derived(
    `${preferredDisplay.values.width} / ${preferredDisplay.values.height}`,
  );

  $effect(() => {
    updateContent($byteStore).catch(assertUnreachable);
  });

  onDestroy(() => {
    revokeCurrentImageUrl(image);
  });
</script>

<button
  class={`image ${image.state}`}
  class:clickable={isClickable}
  class:responsive
  style:--c-t-image-aspect-ratio={preferredAspectRatio}
  style:--c-t-image-min-width={`${constraints.min.width}px`}
  style:--c-t-image-min-height={`${constraints.min.height}px`}
  style:--c-t-image-width={`${preferredDisplay.values.width}px`}
  style:--c-t-image-height={`${preferredDisplay.values.height}px`}
  style:--c-t-image-max-width={`${constraints.max.width}px`}
  style:--c-t-image-max-height={`${constraints.max.height}px`}
  disabled={!isClickable}
  tabindex={isFocusable ? 0 : -1}
  {onclick}
>
  {#if image.state === 'loading'}
    {#if snippetLoading}
      {@render snippetLoading()}
    {:else}
      <span class="placeholder"></span>
    {/if}
  {:else if image.state === 'loaded'}
    <img class:cover={!preferredDisplay.isAspectRatioObeyed} src={image.url} alt={description} />
  {:else if image.state === 'failed'}
    {#if snippetFailed}
      {@render snippetFailed()}
    {:else}
      <span class="placeholder cover failed">
        <MdIcon theme="Filled">broken_image</MdIcon>
      </span>
    {/if}
  {:else}
    {svelteUnreachable(image)}
  {/if}
</button>

<style lang="scss">
  @use 'component' as *;

  $-vars: (
    image-aspect-ratio,
    image-min-width,
    image-min-height,
    image-width,
    image-height,
    image-max-width,
    image-max-height
  );
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  .image {
    @extend %neutral-input;

    display: inline-flex;
    margin: 0;
    padding: 0;
    width: auto;

    // Reset bottom gap.
    vertical-align: middle;

    &.clickable {
      cursor: pointer;
    }

    img,
    .placeholder,
    &.loading :global(> :first-child),
    &.failed :global(> :first-child) {
      flex: 1;
      vertical-align: middle;

      aspect-ratio: var($-temp-vars, --c-t-image-aspect-ratio);

      width: var($-temp-vars, --c-t-image-width);
      height: auto;
      max-width: var($-temp-vars, --c-t-image-max-width);
      max-height: var($-temp-vars, --c-t-image-max-height);

      display: inline-block;
      background-color: var(--mc-message-image-placeholder-background-color);

      object-fit: contain;
      object-position: center;

      &.cover {
        object-fit: cover;
      }
    }

    .placeholder.failed,
    &.failed :global(> :first-child) {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: rem(24px);
    }

    &.responsive {
      img,
      .placeholder,
      &.loading :global(> :first-child),
      &.failed :global(> :first-child) {
        max-width: min(var($-temp-vars, --c-t-image-max-width), 100%);
        max-height: min(var($-temp-vars, --c-t-image-max-height), 100%);
      }
    }
  }
</style>
