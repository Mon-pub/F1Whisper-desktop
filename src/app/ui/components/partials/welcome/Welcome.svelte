<script lang="ts">
  import type {AppServicesForSvelte} from '~/app/types';
  import Logo from '~/app/ui/components/partials/logo/Logo.svelte';
  import {display} from '~/common/dom/ui/state';
  import {unusedProp} from '~/common/utils/svelte-helpers';

  interface Props {
    services: AppServicesForSvelte;
  }

  const {services}: Props = $props();
  unusedProp(services);
</script>

<div class="welcome" data-build-platform={import.meta.env.BUILD_PLATFORM}>
  {#if import.meta.env.BUILD_VARIANT !== 'custom'}
    <span data-display={$display}>
      <Logo />
    </span>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .welcome {
    position: relative;
    display: grid;
    place-items: center;

    span {
      display: inline-block;
      width: rem(96px);
      height: rem(193px);
      color: var(--t-main-welcome-icon-color);

      &[data-display='large'] {
        width: rem(120px);
        height: rem(139px);
      }
    }

    &[data-build-platform='macos'] {
      &::before {
        position: absolute;
        content: '';
        left: 0;
        right: 0;
        top: 0;
        height: rem(64px);

        // Use as drag area for the Electron window.
        -webkit-app-region: drag;
      }
    }
  }
</style>
