<script lang="ts">
  import type {HintProps} from '~/app/ui/components/atoms/hint/props';
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import Tooltip from '~/app/ui/generic/popover/Tooltip.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {id, icon, text}: HintProps = $props();

  let tooltipComponent = $state<SvelteNullableBinding<Tooltip>>(null);

  const anchorName = $derived(`--${id}` as const);
</script>

<div
  class="icon"
  role="tooltip"
  style:anchor-name={anchorName}
  onmouseenter={tooltipComponent?.open}
  onmouseleave={tooltipComponent?.close}
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
