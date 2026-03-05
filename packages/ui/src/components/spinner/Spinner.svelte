<script lang="ts" module>
  import type {SVGAttributes} from 'svelte/elements';
  import {cn, tv} from 'tailwind-variants';

  import type {WithoutChildren} from '../../utils/children';
  import type {WithElementRef} from '../../utils/element';

  export const spinnerVariants = tv({
    base: 'h-full w-full [animation:spin_1.4s_linear_infinite]',
  });

  export type SpinnerProps = WithElementRef<
    WithoutChildren<
      Omit<SVGAttributes<SVGSVGElement>, 'viewBox'> & {
        readonly class?: string;
      }
    >,
    SVGSVGElement
  >;
</script>

<script lang="ts">
  let {class: className, ref = $bindable(null), ...restProps}: SpinnerProps = $props();
</script>

<!--
  The outer `<svg>` rotates continuously via the `animate-spin` keyframe. The `<circle>`
  independently animates its stroke-dasharray to create the growing/shrinking arc.
-->
<svg
  bind:this={ref}
  aria-hidden="true"
  class={cn(spinnerVariants(), className)}
  viewBox="20 20 40 40"
  {...restProps}
>
  <circle class="arc" cx="40" cy="40" r="15" fill="none" stroke="currentColor" stroke-width="3" />
</svg>

<style>
  @keyframes spin {
    0% {
      stroke-dasharray: 1, 200;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 100, 200;
      stroke-dashoffset: -15;
    }
    100% {
      stroke-dasharray: 100, 200;
      stroke-dashoffset: -125;
    }
  }

  .arc {
    animation: spin 1.4s ease-in-out infinite;
  }
</style>
