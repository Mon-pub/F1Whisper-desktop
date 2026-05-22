<script lang="ts">
  import type {AvailabilityBannerProps} from '~/app/ui/components/atoms/availability-banner/props';
  import {i18n} from '~/app/ui/i18n';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {mapToLabel} from '~/app/ui/utils/availability-status';
  import {mapToColor, mapToIcon, mapToString} from '~/common/utils/availability-status';

  const {
    status,
    description,
    showIcon = false,
    expandOnHover = false,
    align = 'center',
    onEdit = undefined,
  }: AvailabilityBannerProps = $props();

  const message = $derived(mapToLabel(status, description, $i18n));
</script>

<div class="container">
  <div class={['content', mapToString(status)]}>
    {#if showIcon}
      <div class="icon" style:--c-availability-status-icon-color={mapToColor(status)}>
        <MdIcon theme="Filled">{mapToIcon(status)}</MdIcon>
      </div>
    {/if}

    <span class={['message', expandOnHover ? 'expand' : undefined]} data-align={align}>
      {message}
    </span>

    {#if onEdit}
      <button class="button" onclick={onEdit} type="button">
        {$i18n.t('common.action--edit', 'Edit')}
      </button>
    {/if}
  </div>
</div>

<style lang="scss">
  @use 'component' as *;

  $-temp-vars: (--c-availability-status-icon-color);

  .container {
    width: 100%;
    min-height: rem(56px);
    padding: rem(8px);
    display: flex;
    align-items: center;

    .content {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      border-radius: rem(10px);
      padding: 0 rem(16px);
      gap: rem(8px);
      color: var(--t-text-e1-color);

      &.busy {
        background-color: var(--cc-availability-status-banner-busy-color);
      }

      &.unavailable {
        background-color: var(--cc-availability-status-banner-unavailable-color);
      }
    }

    .icon {
      display: flex;
      align-items: center;
      font-size: large;
      flex-shrink: 0;
      color: var($-temp-vars, --c-availability-status-icon-color);
    }

    .message {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      margin: rem(8px);

      &[data-align='left'] {
        text-align: left;
      }

      &[data-align='center'] {
        text-align: center;
      }

      &.expand {
        &:hover {
          white-space: normal;
          overflow-wrap: anywhere;
        }
      }
    }

    .button {
      flex-shrink: 0;

      appearance: none;
      font: inherit;
      padding: 0 rem(12px);

      border: rem(1px) solid var(--t-nav-background-color);
      border-radius: rem(8px);
      background-color: var(--t-nav-background-color);
      color: var(--t-text-e1-color);

      &:hover {
        background-color: var(--c-input-text-background-color--active);
        cursor: pointer;
      }
    }
  }
</style>
