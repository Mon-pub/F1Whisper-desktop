<script lang="ts">
  import type {HintProps} from '~/app/ui/components/atoms/hint/props';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Tooltip from '~/app/ui/generic/popover/Tooltip.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  type $$Props = HintProps;

  export let id: $$Props['id'];
  export let icon: $$Props['icon'];
  export let text: $$Props['text'];

  let tooltipComponent: SvelteNullableBinding<Tooltip>;

  $: anchorName = `--${id}` as const;
</script>

<div
  class="icon"
  role="tooltip"
  style:anchor-name={anchorName}
  on:mouseenter={tooltipComponent?.open}
  on:mouseleave={tooltipComponent?.close}
>
  <MdIcon theme="Outlined">{icon}</MdIcon>
</div>

<Tooltip bind:this={tooltipComponent} {anchorName}>
  <span class="content">
    <Text alignment="center" {text} />
  </span>
</Tooltip>

<style lang="scss">
  @use 'component' as *;

  .icon {
    font-size: rem(20px);
  }

  .content {
    padding: 0;
    margin: rem(10px);
    max-width: rem(280px);
    text-align: center;
  }
</style>
