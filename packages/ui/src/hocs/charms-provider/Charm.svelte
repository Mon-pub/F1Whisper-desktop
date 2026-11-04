<!--
@component An element placed on top of the parent `CharmsProvider`'s content, which causes a cutout
in said content. Must be used as a child of a `CharmsProvider`.

The charm takes the size of its content, i.e. size the content itself instead of the charm. Note:
Because its cutout is calculated from the rendered size, the content needs an absolute size of its
own (i.e. not a relative one, like `h-full`).

@example
```svelte
<CharmsProvider>
  {#snippet charms()}
    <Charm position={{type: 'radial', degrees: 45}}>
      <button class="size-4 rounded-full">...</button>
    </Charm>
  {/snippet}

  <MyWrappedContent />
</CharmsProvider>
```
-->

<script lang="ts" module>
  import type {u53} from '@threema/ts-utils/integer/u53';
  import {onDestroy} from 'svelte';
  import type {HTMLAttributes} from 'svelte/elements';
  import {cn} from 'tailwind-variants';

  import type {WithChildren, WithoutChildren} from '../../utils/children';
  import type {WithElementRef} from '../../utils/element';

  import {getCharmsRegistryContext} from './context';
  import {getRelativeCharmPosition, type CharmPosition} from './helpers';

  type BaseProps = WithElementRef<
    WithChildren<{
      /**
       * Width of the transparent gap between the charm and the cutout in the content it is placed
       * on, in pixels. Defaults to `2`. Note: A gap of `0` causes rendering of the cutout to be
       * skipped entirely.
       */
      readonly gapPx?: u53;
      /**
       * Where to place the charm on its container.
       */
      readonly position: CharmPosition;
    }>,
    HTMLSpanElement
  >;

  export type CharmProps = BaseProps &
    WithoutChildren<
      Omit<
        HTMLAttributes<HTMLSpanElement>,
        keyof BaseProps | 'bind:offsetHeight' | 'bind:offsetWidth'
      >
    >;
</script>

<script lang="ts">
  let {
    children,
    class: className,
    gapPx = 2,
    position,
    ref = $bindable(null),
    ...restProps
  }: CharmProps = $props();

  // Note: Svelte reads these bindings once before the first paint (and from then on only when the
  // underlying `ResizeObserver` reports a change), so the measurement for the cutout is correct
  // from the start. The values are rounded to whole pixels, which is precise enough for a cutout
  // with a gap around it.
  let offsetHeight = $state<u53 | undefined>(undefined);
  let offsetWidth = $state<u53 | undefined>(undefined);

  const sizePx = $derived(
    offsetWidth === undefined || offsetHeight === undefined
      ? undefined
      : {width: offsetWidth, height: offsetHeight},
  );

  const context = getCharmsRegistryContext();
  const id = Symbol('charm');

  const registration = {
    get gapPx() {
      return gapPx;
    },
    get position() {
      return position;
    },
    get sizePx() {
      return sizePx;
    },
  };

  // Register the charm in the surrounding provider's context during initialization (instead of in
  // an `$effect`), so that the cutouts are complete as soon as the provider renders. Because the
  // registration reads the props through getters, the provider keeps track of changes to them.
  context.register(id, registration);
  onDestroy(() => {
    context.unregister(id);
  });

  const style = $derived.by(() => {
    const {offsetPx, x, y} = getRelativeCharmPosition(position);

    // `-50%` of the charm's own size centers it on its position.
    return {
      left: `${x}%`,
      top: `${y}%`,
      translate: [`calc(-50% + ${offsetPx.x}px)`, `calc(-50% + ${offsetPx.y}px)`].join(' '),
    };
  });
</script>

<span
  bind:offsetHeight
  bind:offsetWidth
  bind:this={ref}
  class={cn('absolute', className)}
  style:left={style.left}
  style:top={style.top}
  style:translate={style.translate}
  {...restProps}
>
  {@render children?.()}
</span>
