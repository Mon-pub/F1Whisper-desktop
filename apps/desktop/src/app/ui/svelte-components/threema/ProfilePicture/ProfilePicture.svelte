<!--
  @component A profile picture with fallback to a colored background with two initials.

  If the `img` property is a promise, then the fallback profile picture will be shown until the
  promise is resolved.

  The `img` property may not be undefined, but you may pass in a promise that never resolves (for
  example with `Promise.race([])`).
-->
<script lang="ts">
  import type {HTMLImgAttributes} from 'svelte/elements';

  import Image from '~/app/ui/svelte-components/blocks/Image/Image.svelte';
  import type {
    ProfilePictureColor,
    ProfilePictureShape,
  } from '~/app/ui/svelte-components/threema/ProfilePicture';
  import {eternalPromise} from '~/common/utils/promise';

  interface Props extends Pick<HTMLImgAttributes, 'onerror' | 'onload'> {
    /**
     * Text alternative to the profile picture if displayed as an image.
     */
    readonly alt: string;
    /**
     * The color associated to the profile picture.
     */
    readonly color: ProfilePictureColor;
    /**
     * Use predefined font sizes.
     */
    readonly fontSize?: 'small' | 'large';
    /**
     * The image resource.
     */
    readonly img: Blob | undefined;

    /**
     * Initials to be displayed while the profile picture image is unavailable.
     */
    readonly initials: string;
    /**
     * Optional profile picture display shape, defaults to 'square'.
     */
    readonly shape?: ProfilePictureShape;
    /**
     * Optional title of the profile picture to be displayed when hovering.
     */
    readonly title?: string | undefined;
  }

  const {
    alt,
    color,
    fontSize = 'large',
    img,
    initials,
    shape = 'square',
    title = undefined,
    ...rest
  }: Props = $props();
</script>

<div data-color={color} data-shape={shape}>
  {#if img === undefined}
    <Image src={eternalPromise()} {alt} {...rest}>
      <span class="initials" data-size={fontSize}>{initials}</span>
    </Image>
  {:else}
    <Image src={img} {alt} {title} {...rest}>
      <span class="initials" data-size={fontSize}>{initials}</span>
    </Image>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  div {
    @include def-var(
      (--c-image-width: 100%, --c-image-height: 100%, --c-image-object-fit: cover)...
    );

    display: grid;
    place-items: center;
    user-select: none;
    width: var(--c-profile-picture-size, default);
    height: var(--c-profile-picture-size, default);
    overflow: hidden;

    @each $color in map-get-req($config, profile-picture-colors) {
      &[data-color='#{$color}'] {
        background-color: var(--c-profile-picture-background-#{$color}, default);

        .initials {
          color: var(--c-profile-picture-initials-#{$color}, default);
        }
      }
    }

    &[data-shape='circle'] {
      border-radius: 50%;
    }
  }

  .initials {
    text-transform: uppercase;

    &[data-size='large'] {
      @extend %font-large-400;
    }
    &[data-size='small'] {
      @extend %font-small-400;
    }
  }
</style>
