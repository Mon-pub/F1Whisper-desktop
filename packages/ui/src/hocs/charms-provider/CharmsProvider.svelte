<!--
@component HOC which places charms (e.g. badges or buttons) on the content it wraps, and places them
on top of cutouts in the underlying element.

The charms need to be passed to the `CharmsProvider` as child components (`CharmsProvider.Charm`),
which register themselves to this provider instead of being configured through props. This way, they
can be placed, conditionally rendered and styled at the call site, while the provider takes care of
the positioning and matching cutouts.

@example
```svelte
<CharmsProvider>
  {#snippet charms()}
    <CharmsProvider.Charm position={{type: 'radial', degrees: 45}}>
      <MyBadge class="size-4" />
    </CharmsProvider.Charm>
  {/snippet}
  <MyContent />
</CharmsProvider>
```
-->

<script lang="ts" module>
  import type {Snippet} from 'svelte';
  import type {HTMLAttributes} from 'svelte/elements';
  import {SvelteMap} from 'svelte/reactivity';
  import {cn} from 'tailwind-variants';

  import type {WithChildren, WithoutChildren} from '../../utils/children';
  import type {WithElementRef} from '../../utils/element';
  import RadialExclusionMaskProvider, {
    type RadialExclusionMaskProviderCutout,
  } from '../radial-exclusion-mask-provider/RadialExclusionMaskProvider.svelte';

  import {setCharmsRegistryContext, type CharmRegistration} from './context';
  import {getRelativeCharmPosition} from './helpers';

  type BaseProps = WithElementRef<
    WithChildren<{
      /**
       * The charms to place on the content, i.e. one or more `Charm`s.
       */
      readonly charms?: Snippet;
    }>,
    HTMLDivElement
  >;

  export type CharmsProviderProps = BaseProps &
    WithoutChildren<Omit<HTMLAttributes<HTMLDivElement>, keyof BaseProps>>;
</script>

<script lang="ts">
  let {charms, children, class: className, ref = $bindable(null)}: CharmsProviderProps = $props();

  /**
   * Charms which announced themselves via context, in the order they were registered in.
   */
  const registrations = new SvelteMap<symbol, CharmRegistration>();

  setCharmsRegistryContext({
    register: (id, registration) => {
      registrations.set(id, registration);
    },
    unregister: (id) => {
      registrations.delete(id);
    },
  });

  /**
   * Cutouts to apply to the mask, based on the placements and sizing of the charms.
   */
  const cutouts: RadialExclusionMaskProviderCutout[] = $derived(
    [...registrations.values()].flatMap(({gapPx, position, sizePx}) => {
      // Without a gap, a cutout would end up entirely underneath the charm (or, if the charm is
      // not round, stick out from behind it), so we don't need to draw it at all.
      if (gapPx <= 0) {
        return [];
      }

      // A charm is sized by its content, so there is nothing to cut out before it has been
      // rendered and measured, or if its content turns out to have no size at all (e.g. because
      // the charm is not displayed).
      if (sizePx === undefined || (sizePx.width <= 0 && sizePx.height <= 0)) {
        return [];
      }

      // The cutout is a circle, so it is sized by the charm's larger side.
      const diameter = Math.max(sizePx.width, sizePx.height) + gapPx * 2;
      const {offsetPx, x, y} = getRelativeCharmPosition(position);

      return [{diameter, offsetPx, position: {x, y}}];
    }),
  );
</script>

<!--
  The container is `relative`, because the charms are positioned absolutely within it.
-->
<div bind:this={ref} class={cn('relative', className)}>
  <!--
    The mask spans the whole container and centers the content in it, so that a position in percent
    means the same for a charm (positioned within the container) as for its cutout (positioned
    within the mask).
  -->
  <RadialExclusionMaskProvider class="grid size-full place-items-center" {cutouts}>
    {@render children?.()}
  </RadialExclusionMaskProvider>

  {@render charms?.()}
</div>
