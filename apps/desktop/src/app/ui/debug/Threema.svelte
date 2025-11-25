<script lang="ts">
  import type {AppServicesForSvelte} from '~/app/types';
  import {unusedProp} from '~/common/utils/svelte-helpers';

  interface Props {
    services: AppServicesForSvelte;
  }

  const {services}: Props = $props();

  unusedProp(services);
</script>

<section class="threema">
  <h2>Jobs</h2>
  <a href="https://threema.ch/jobs" target="_blank" rel="noreferrer noopener">
    Join the Threema Team!
  </a>
</section>

<style lang="scss">
  @use 'component' as *;

  .threema {
    display: grid;
    place-items: center;
  }
</style>
