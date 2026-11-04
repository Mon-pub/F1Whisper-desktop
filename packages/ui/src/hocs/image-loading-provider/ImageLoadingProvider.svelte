<!--
@component HOC for loading image data from various sources with handling for errors, or missing
image data.

It does not render an `<img>` itself. Instead, it resolves the `source` and renders one of two
snippets: `imageSnippet(props)`, which provides props you wire to your own `<img>` element, or
`fallbackSnippet` if the source is missing, invalid, or fails to load.

@example
```svelte
<ImageLoadingProvider {source}>
  {#snippet imageSnippet(props)}
    <img class="..." alt="..." {...props} />
  {/snippet}
  {#snippet fallbackSnippet()}
    <span class="fallback">JD</span>
  {/snippet}
</ImageLoadingProvider>
```
-->

<script lang="ts" module>
  import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
  import type {Snippet} from 'svelte';

  export interface ImageLoadingProviderImageProps {
    readonly src: string | undefined;
    readonly onerror: () => void;
  }

  export interface ImageLoadingProviderProps {
    /**
     * The snippet which is displayed if loading or validating the image failed, or it's
     * `undefined`.
     */
    fallbackSnippet?: Snippet;
    /**
     * The snippet which is displayed if loading or validating the image was successful. Important:
     * Make sure to wire up the provided props to an `<img>` element.
     */
    imageSnippet: Snippet<[props: ImageLoadingProviderImageProps]>;
    /**
     * The source of the image as an url or bytes. Note: If a `string` is passed, it's required to
     * be a valid url, or the fallback will be used instead.
     */
    source: string | URL | Blob | ReadonlyUint8Array | MediaSource | undefined;
  }
</script>

<script lang="ts">
  import {createObjectUrlFromBytes} from '../../utils/create-object-url-from-bytes';

  const {fallbackSnippet, imageSnippet, source}: ImageLoadingProviderProps = $props();

  let isError = $state(false);
  let src = $state<string | undefined>(undefined);

  function handleOnError(): void {
    isError = true;
  }

  // `$effect` is used here instead of `$derived` because `createObjectUrlFromBytes` is a
  // side-effect.
  $effect(() => {
    // Reset the stale failure state whenever `source` changes.
    isError = false;

    if (source === undefined) {
      src = undefined;
      return undefined;
    }
    if (source instanceof URL) {
      // `URL` is considered to already be validated.
      src = source.toString();
      return undefined;
    }
    if (typeof source === 'string') {
      // If the string is empty or is not parseable as an `URL`, reject it. Uses `document.baseURI`
      // to allow relative urls as well.
      src = source.trim() === '' || !URL.canParse(source, document.baseURI) ? undefined : source;
      return undefined;
    }

    // `Blob`, raw bytes and `MediaSource` are turned into an object URL which must be revoked again
    // once the source changes or the component unmounts.
    try {
      const {dispose, url} = createObjectUrlFromBytes(source);
      src = url;
      // Dispose current object URL before the `$effect` reruns or the component unmounts.
      return dispose;
    } catch {
      src = undefined;
      return undefined;
    }
  });
</script>

{#if isError || src === undefined}
  {@render fallbackSnippet?.()}
{:else}
  {@render imageSnippet({src, onerror: handleOnError})}
{/if}
