<!--
  @component Renders the given content wrapped in a container which the given radial cutouts are
  excluded from, similar to Emmentaler cheese.
-->
<script lang="ts" module>
  import type {f64} from '@threema/ts-utils/float/f64';
  import type {u53} from '@threema/ts-utils/integer/u53';
  import type {Snippet} from 'svelte';

  export interface RadialExclusionMaskProviderCutout {
    /**
     * Diameter of the cutout, in pixels.
     */
    readonly diameter: u53;
    /**
     * Offset of the cutout's center from its {@link position}, in pixels. Useful to nudge a cutout
     * by an absolute amount, without having to know the container's size.
     */
    readonly offsetPx?: {
      readonly x: f64;
      readonly y: f64;
    };
    /**
     * Position of the cutout's center relative to the top left corner of the container, in
     * percent (e.g., `20`).
     */
    readonly position: {
      readonly x: f64;
      readonly y: f64;
    };
  }

  /**
   * Props accepted by the `RadialExclusionMaskProvider` component.
   */
  export interface RadialExclusionMaskProviderProps {
    /**
     * Classes for the masked container. Note: A cutout's position is relative to this container, so
     * they should not shrink it below the area the cutouts are positioned in.
     */
    readonly class?: string;
    readonly children?: Snippet;
    /**
     * An array of radial cutouts to exclude from the container. If it is empty, no mask will be
     * applied.
     */
    readonly cutouts: RadialExclusionMaskProviderCutout[];
  }
</script>

<script lang="ts">
  const {class: className, children, cutouts}: RadialExclusionMaskProviderProps = $props();

  /**
   * Get the CSS length of a cutout's position along one axis, in percent of the container plus an
   * optional offset in pixels.
   */
  function getAxisStyle(percent: f64, offsetPx: f64 | undefined): string {
    return offsetPx === undefined || offsetPx === 0
      ? `${percent}%`
      : `calc(${percent}% + ${offsetPx}px)`;
  }

  /**
   * Get the CSS style of a single cutout, expressed as a `radial-gradient`.
   */
  function getRadialGradientStyle({
    diameter,
    offsetPx,
    position: {x, y},
  }: (typeof cutouts)[u53]): `radial-gradient(${string})` {
    const radius = diameter / 2;
    const position = `${getAxisStyle(x, offsetPx?.x)} ${getAxisStyle(y, offsetPx?.y)}`;

    /* Add a small gap of 1% between the cutout and the opaque area for smooth edges. */
    return `radial-gradient(circle ${radius}px at ${position}, transparent ${radius}px, black ${radius + 1}px, black 100%)`;
  }

  /**
   * Get the CSS style of an exclusion mask consiting of multiple cutouts, expressed as a
   * `mask-image` and `mask-composite`. Returns `undefined` if the given array of cutouts is empty.
   */
  function getExclusionMaskStyle(currentCutouts: typeof cutouts): {
    maskComposite?: string;
    maskImage?: string;
  } {
    if (currentCutouts.length === 0) {
      return {
        maskComposite: undefined,
        maskImage: undefined,
      };
    }

    const gradientStyles = currentCutouts.map((cutout) => getRadialGradientStyle(cutout));

    // A pixel stays opaque if, and only if, *every* cutout layer is opaque there.
    return {
      maskComposite: 'intersect',
      maskImage: gradientStyles.join(', '),
    };
  }

  const exclusionMaskStyle = $derived(getExclusionMaskStyle(cutouts));
</script>

<span
  class={className}
  style:mask-image={exclusionMaskStyle.maskImage}
  style:mask-composite={exclusionMaskStyle.maskComposite}
>
  {@render children?.()}
</span>
