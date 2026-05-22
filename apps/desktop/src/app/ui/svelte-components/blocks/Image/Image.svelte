<!--
  @component
  Load and display an image resource.

  To specify fallback content that will be shown until the image data is loaded,
  specify a slot value:

  ```html
  <Image src="https://example.com/image.jpg" alt="An image">
    <img src="loading.gif" alt="Loading...">
    <span slot="error">Uh-oh, image could not be loaded or rendered</span>
  </Image>
  ```

  The `src` property may not be undefined, but you may pass in a promise that
  never resolves (for example with `Promise.race([])`).
-->
<script lang="ts">
  import {ensureError} from '@threema/ts-utils/meta/ensure-error';
  import {onDestroy, tick, type Snippet} from 'svelte';
  import type {HTMLImgAttributes} from 'svelte/elements';

  import {globals} from '~/app/globals';
  import type {StringOrLiteral} from '~/common/types';
  import {assertUnreachable} from '~/common/utils/assert';
  import {isSupportedImageType} from '~/common/utils/image';
  import {AsyncLock} from '~/common/utils/lock';

  const log = globals.unwrap().uiLogging.logger('ui.component.image');

  interface Props extends Omit<HTMLImgAttributes, 'alt' | 'src'> {
    /**
     * Sets or retrieves a text alternative to the image.
     */
    readonly alt: string;
    readonly children?: Snippet;
    readonly snippetError?: Snippet;
    /**
     * The image resource to render. May also be a promise. Note: Will only be rendered if the media
     * type is valid and whitelisted.
     */
    readonly src: Blob | Promise<Blob>;
  }

  let {alt, children, onerror, snippetError, src, ...rest}: Props = $props();

  let url = $state<StringOrLiteral<'loading' | 'failed'>>('loading');
  const urlUpdateLock = new AsyncLock();

  function revokeUrl(urlToRevoke: string): void {
    if (urlToRevoke !== 'loading' && urlToRevoke !== 'failed') {
      URL.revokeObjectURL(urlToRevoke);
    }
  }

  async function updateUrl(currentSrc: typeof src): Promise<void> {
    await urlUpdateLock.with(async () => {
      const blob =
        currentSrc instanceof Promise
          ? await currentSrc.catch((error: unknown) => {
              log.error(
                `Could not update image url due to an error while loading the blob: ${error}`,
              );

              return undefined;
            })
          : currentSrc;
      const previousUrl = url;

      if (blob === undefined) {
        url = 'failed';
      } else if (!isSupportedImageType(blob.type)) {
        url = 'failed';

        log.error('Image media type is not allowed');
      } else {
        url = URL.createObjectURL(blob);
      }

      revokeUrl(previousUrl);
      await tick();
    });
  }

  $effect(() => {
    updateUrl(src).catch(assertUnreachable);
  });

  onDestroy(() => {
    revokeUrl(url);
  });
</script>

{#if url === 'loading'}
  {@render children?.()}
{:else if url === 'failed'}
  <!-- Fall back the error slot, then to the default slot. -->
  {#if snippetError !== undefined}
    {@render snippetError?.()}
  {:else}
    {@render children?.()}
  {/if}
{:else}
  <img
    {alt}
    onerror={(error) => {
      onerror?.(error);
      // Force falling back to the error/default slot.
      src = Promise.reject(ensureError(error));
    }}
    src={url}
    {...rest}
  />
{/if}

<style lang="scss">
  @use 'component' as *;

  img {
    max-width: 100%;
    max-height: 100%;
    width: var(--c-image-width, default);
    height: var(--c-image-height, default);
    object-fit: var(--c-image-object-fit, default);
    border-radius: inherit;
  }
</style>
