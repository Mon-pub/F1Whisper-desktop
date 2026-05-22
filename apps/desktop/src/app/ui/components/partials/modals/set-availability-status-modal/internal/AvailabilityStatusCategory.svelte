<script lang="ts">
  import Text from '~/app/ui/components/atoms/text/Text.svelte';
  import type {AvailabilityStatusCategoryProps} from '~/app/ui/components/partials/modals/set-availability-status-modal/internal/props';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {mapToLabel} from '~/app/ui/utils/availability-status';
  import {mapToColor, mapToIcon, mapToString} from '~/common/utils/availability-status';

  const {selected, category, onclick}: AvailabilityStatusCategoryProps = $props();

  function click(): void {
    onclick(category);
  }

  const icon = $derived.by(() => mapToIcon(category));
  const label = $derived.by(() => mapToLabel(category, undefined, $i18n));
</script>

<button class="container" class:selected onclick={click}>
  <div
    class="categoryIcon"
    data-category={mapToString(category)}
    style:--c-availability-status-icon-color={mapToColor(category)}
  >
    <MdIcon theme="Filled">{icon}</MdIcon>
  </div>
  <Text selectable={false} text={label}></Text>
</button>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-availability-status-icon-color);

  .container {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    border-radius: rem(12px);

    display: flex;
    align-items: center;
    gap: rem(16px);
    padding: rem(14px) rem(12px);

    &.selected {
      background-color: var(--c-input-text-background-color--active);
    }

    &:hover {
      background-color: var(--c-input-text-background-color--active);
      cursor: pointer;
    }

    .categoryIcon {
      width: rem(42px);
      height: rem(42px);

      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: rem(10px);

      font-size: xx-large;
      color: var($-temp-vars, --c-availability-status-icon-color);

      &[data-category='none'] {
        background-color: var(--cc-availability-status-bg-nostatus-color);
      }

      &[data-category='busy'] {
        background-color: var(--cc-availability-status-bg-busy-color);
      }

      &[data-category='unavailable'] {
        background-color: var(--cc-availability-status-bg-unavailable-color);
      }
    }
  }
</style>
