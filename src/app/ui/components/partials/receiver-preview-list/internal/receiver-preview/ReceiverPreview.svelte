<!--
  @component Renders a preview card for the given conversation.
-->
<script lang="ts">
  import {getFragmentForRoute} from '~/app/routing/router';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import {contextmenu} from '~/app/ui/actions/contextmenu';
  import ContextMenuProvider from '~/app/ui/components/hocs/context-menu-provider/ContextMenuProvider.svelte';
  import ReceiverCard from '~/app/ui/components/partials/receiver-card/ReceiverCard.svelte';
  import {
    getReceiverCardBottomLeftItemOptions,
    getReceiverCardTopRightItemOptions,
  } from '~/app/ui/components/partials/receiver-preview-list/helpers';
  import type {ReceiverPreviewProps} from '~/app/ui/components/partials/receiver-preview-list/internal/receiver-preview/props';
  import type Popover from '~/app/ui/generic/popover/Popover.svelte';
  import type {VirtualRect} from '~/app/ui/generic/popover/types';
  import {i18n} from '~/app/ui/i18n';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbReceiverLookup} from '~/common/db';

  const {
    active,
    contextMenuOptions = {items: []},
    highlights,
    onclick,
    options = {},
    receiver,
    services,
  }: ReceiverPreviewProps = $props();

  let popoverComponent = $state<SvelteNullableBinding<Popover>>(null);

  let contextMenuPosition = $state<VirtualRect | undefined>();
  let isContextMenuOpen = $state<boolean>(false);

  function handleClick(event: MouseEvent): void {
    if (isContextMenuOpen) {
      event.preventDefault();
      return;
    }

    onclick?.(event);
  }

  function handleAlternativeClick(event: MouseEvent): void {
    event.preventDefault();

    contextMenuPosition = {
      left: event.clientX,
      right: 0,
      top: event.clientY,
      bottom: 0,
      width: 0,
      height: 0,
    };

    if (popoverComponent !== null && popoverComponent !== undefined) {
      popoverComponent.open(event);
      isContextMenuOpen = true;
    }
  }

  function handleClickContextMenuItem(): void {
    if (popoverComponent !== null && popoverComponent !== undefined) {
      popoverComponent.close();
      isContextMenuOpen = false;
    }
  }

  function handleContextMenuHasClosed(): void {
    isContextMenuOpen = false;
  }

  function getItemUrl(receiverLookup: DbReceiverLookup): string {
    const route = ROUTE_DEFINITIONS.main.conversation.withParams({receiverLookup});
    return `#${getFragmentForRoute(route) ?? ''}`;
  }
</script>

<li
  use:contextmenu={handleAlternativeClick}
  class="container"
  data-receiver={receiver.type === 'self'
    ? 'self'
    : `${receiver.lookup.type}.${receiver.lookup.uid}`}
>
  <ContextMenuProvider
    bind:popover={popoverComponent}
    anchorPoints={{
      reference: {
        horizontal: 'left',
        vertical: 'bottom',
      },
      popover: {
        horizontal: 'left',
        vertical: 'top',
      },
    }}
    closeOnClickOutside={true}
    onafterclose={handleContextMenuHasClosed}
    onclickitem={handleClickContextMenuItem}
    reference={contextMenuPosition}
    triggerBehavior="none"
    {...contextMenuOptions}
  >
    {#if receiver.type === 'self'}
      <span class="item self">
        <ReceiverCard
          content={{
            topLeft: [
              {
                type: 'text',
                text: {
                  raw: $i18n.t('contacts.label--own-name'),
                },
              },
            ],
            bottomLeft: getReceiverCardBottomLeftItemOptions(receiver),
          }}
          options={{
            isClickable: false,
          }}
          {receiver}
          {services}
          size="md"
        />
      </span>
    {:else}
      <!-- eslint-disable-next-line @typescript-eslint/no-unsafe-argument --><!-- prettier-ignore -->
      <a href={getItemUrl(receiver.lookup)} class="item" class:active={active && options.highlightWhenActive !== false} onclick={handleClick}>
        <ReceiverCard
          content={{
            topLeft: [
              {
                type: 'receiver-name',
                receiver,
                highlights,
              },
            ],
            topRight: getReceiverCardTopRightItemOptions(receiver, $i18n),
            bottomLeft: getReceiverCardBottomLeftItemOptions(receiver),
            bottomRight:
              receiver.type === 'contact'
                ? [
                    {
                      type: 'blocked-icon',
                      isBlocked: receiver.isBlocked,
                    },
                    {
                      type: 'text',
                      text: {
                        raw: receiver.identity,
                      },
                    },
                  ]
                : undefined,
          }}
          options={{
            isClickable: true,
            isFocusable: false,
          }}
          {receiver}
          {services}
          size="md"
        />
      </a>
    {/if}
  </ContextMenuProvider>
</li>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;

    .item {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;

      padding: rem(10px) rem(16px);
      text-decoration: inherit;
      color: inherit;

      &:not(.self):hover {
        cursor: pointer;
        background-color: var(--cc-conversation-preview-background-color--hover);
      }

      &:not(.self):focus-visible {
        box-shadow: inset 0em 0em 0em em(1px) var(--c-icon-button-naked-outer-border-color--focus);
        outline: none;

        &:not(.active) {
          background-color: var(--cc-conversation-preview-background-color--hover);
        }
      }

      &:not(.self).active {
        background-color: var(--cc-conversation-preview-background-color--active);
      }
    }
  }
</style>
