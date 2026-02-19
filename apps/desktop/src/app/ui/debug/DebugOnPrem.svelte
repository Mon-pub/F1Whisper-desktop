<script lang="ts">
  import type {AppServicesForSvelte} from '~/app/types';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';

  interface Props {
    services: AppServicesForSvelte;
  }

  async function triggerInvalidCertificatePins(): Promise<void> {
    await services.electron.triggerInvalidCertificatePins();
  }

  const {services}: Props = $props();
</script>

<section class="onprem">
  <Button flavor="filled" onclick={triggerInvalidCertificatePins}>
    <span class="icon-and-text"
      ><MdIcon theme="Filled">fiber_manual_record</MdIcon>
      Trigger Invalid Certificate Pins</span
    >
  </Button>
</section>

<style lang="scss">
  @use 'component' as *;

  .onprem {
    padding: rem(8px);
    display: grid;
    gap: rem(8px);
    place-items: center;
    grid-auto-flow: row;
  }

  .icon-and-text {
    display: flex;
    gap: rem(4px);
    place-items: center;
  }
</style>
