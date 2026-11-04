<!--
@component A component that displays an avatar image (or a fallback placeholder based on the
provided `color` and `initials`, in case no image could be loaded). The avatar always fills its
parent container, but its content always stays square and fully contained. Works best if passed a
fixed `size-*` class.

Optionally, charms (e.g. badges or buttons) can be placed on the avatar by passing `<Avatar.Charm>`
components as children.

@example
```svelte
<Avatar image={source} initials="JD" class="size-12">
  <Avatar.Charm position={{type: 'radial', degrees: 45}}>
    <button class="size-4 rounded-full bg-grey-400">…</button>
  </Avatar.Charm>
  <Avatar.Charm position={{type: 'radial', degrees: 90, offsetPx: {x: -5, y: 5}}}>
    <MyBadge />
  </Avatar.Charm>
</Avatar>
```
-->

<script lang="ts" module>
  import {getGraphemeClusters} from '@threema/ts-utils/string/get-grapheme-clusters';
  import type {HTMLAttributes} from 'svelte/elements';
  import {cn, cx} from 'tailwind-variants';

  import {CharmsProvider} from '../../hocs/charms-provider';
  import ImageLoadingProvider, {
    type ImageLoadingProviderProps,
  } from '../../hocs/image-loading-provider/ImageLoadingProvider.svelte';
  import type {WithChildren, WithoutChildren} from '../../utils/children';
  import type {WithElementRef} from '../../utils/element';
  import {
    PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP,
    PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP,
    type ProfilePictureColor,
  } from '../../utils/profile-picture-color';

  type BaseProps = WithElementRef<
    WithChildren<{
      /**
       * Optional profile color for the initials fallback. Defaults to a neutral grey.
       */
      readonly color?: ProfilePictureColor;
      /**
       * The description of the avatar image, used as `alt` text for the image.
       */
      readonly description?: string;
      /**
       * Image source data for the avatar (e.g. the user's profile picture). If not provided, a
       * fallback placeholder containing the given `initials` will be rendered instead.
       */
      readonly image?: ImageLoadingProviderProps['source'];
      /**
       * Initials shown when no `image` is provided.
       */
      readonly initials: string;
    }>,
    HTMLDivElement
  >;

  export type AvatarProps = BaseProps &
    WithoutChildren<Omit<HTMLAttributes<HTMLDivElement>, keyof BaseProps>>;
</script>

<script lang="ts">
  let {
    children,
    class: className,
    color,
    description = '',
    image,
    initials,
    ref = $bindable(null),
    ...restProps
  }: AvatarProps = $props();
</script>

<!--
  Container fills the parent, but the contained image or fallback is always sized to be square and
  fit the shorter edge of the container.
-->
<div
  bind:this={ref}
  class={cn('@container-[size] grid size-full place-items-center', className)}
  {...restProps}
>
  <!--
    `CharmsProvider` is sized by the contained image or fallback, so the charms are placed
    relatively to the wrapped content.
  -->
  <CharmsProvider charms={children}>
    <ImageLoadingProvider source={image}>
      {#snippet imageSnippet(props)}
        <img
          alt={description}
          class="size-[100cqmin] rounded-full object-cover"
          draggable={false}
          {...props}
        />
      {/snippet}

      {#snippet fallbackSnippet()}
        <span
          class={cx(
            'flex size-[100cqmin] items-center justify-center rounded-full text-[clamp(1rem,33cqmin,4rem)] uppercase select-none',
            color === undefined
              ? 'bg-grey-200 text-grey-700 dark:bg-grey-700 dark:text-grey-100'
              : [
                  PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP[color],
                  PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP[color],
                ],
          )}
        >
          <!-- Limit displayed characters to 2 at most. -->
          {getGraphemeClusters(initials, 2).join('')}
        </span>
      {/snippet}
    </ImageLoadingProvider>
  </CharmsProvider>
</div>
