<!--
  @component Renders a preview card for the given conversation.
-->
<script lang="ts">
  import {getFragmentForRoute} from '~/app/routing/router';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import {contextmenu} from '~/app/ui/actions/contextmenu';
  import ContextMenuProvider from '~/app/ui/components/hocs/context-menu-provider/ContextMenuProvider.svelte';
  import {conversationDrafts} from '~/app/ui/components/partials/conversation/drafts';
  import {getReceiverCardBottomLeftItemOptions} from '~/app/ui/components/partials/conversation-preview-list/helpers';
  import type {ConversationPreviewProps} from '~/app/ui/components/partials/conversation-preview-list/internal/conversation-preview/props';
  import ReceiverCard from '~/app/ui/components/partials/receiver-card/ReceiverCard.svelte';
  import type Popover from '~/app/ui/generic/popover/Popover.svelte';
  import type {VirtualRect} from '~/app/ui/generic/popover/types';
  import {i18n} from '~/app/ui/i18n';
  import {getDisplayDateForMessage} from '~/app/ui/utils/timestamp';
  import type {DbReceiverLookup} from '~/common/db';

  const {
    active,
    contextMenuOptions = {items: []},
    highlights,
    onclick,
    onclickjoincall,
    services,
    store,
  }: ConversationPreviewProps = $props();

  const {
    call,
    isArchived,
    isPinned,
    isPrivate,
    isTyping,
    lastMessage,
    receiver,
    unreadMessageCount,
  } = $derived($store);

  const {router} = services;

  let popoverComponent = $state<Popover | undefined>(undefined);

  let contextMenuPosition = $state<VirtualRect | undefined>(undefined);
  let isContextMenuOpen = $state<boolean>(false);

  // TODO(DESK-306): Properly implement drafts.
  const draftStore = $derived.by(() => {
    const routerState = $router;

    if (routerState.main.id === 'conversation') {
      return active ? undefined : conversationDrafts.getOrCreateStore(receiver.lookup);
    } else if (routerState.nav.id === 'conversationList') {
      // Small window size.
      return conversationDrafts.getOrCreateStore(receiver.lookup);
    }

    return undefined;
  });

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
  class="container"
  data-receiver={`${receiver.lookup.type}.${receiver.lookup.uid}`}
  use:contextmenu={handleAlternativeClick}
  class:active
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
    <a href={getItemUrl(receiver.lookup)} class="item" class:active onclick={handleClick}>
      <ReceiverCard
        content={{
          topLeft: [
            {
              type: 'receiver-name',
              receiver,
              highlights,
            },
          ],
          topRight: [
            {
              type: 'charms',
              call,
              isBlocked: receiver.type === 'contact' && receiver.isBlocked,
              isPinned,
              isTyping,
              isPrivate,
              notificationPolicy: receiver.notificationPolicy,
            },
          ],
          bottomLeft: getReceiverCardBottomLeftItemOptions(
            $draftStore,
            $i18n,
            isArchived,
            isPrivate,
            lastMessage,
            receiver,
          ),
          bottomRight:
            lastMessage === undefined || lastMessage.status.deleted !== undefined
              ? undefined
              : [
                  {
                    type: 'relative-timestamp',
                    date: getDisplayDateForMessage(lastMessage.direction, lastMessage.status),
                    format: 'auto',
                    services,
                  },
                  {
                    type: 'status-icon',
                    conversation: {
                      receiver:
                        receiver.type === 'group' &&
                        receiver.creator.type === 'self' &&
                        receiver.members.length === 0
                          ? {type: 'notes-group'}
                          : receiver,
                    },
                    status: lastMessage.status,
                  },
                ],
        }}
        {onclickjoincall}
        options={{
          isClickable: true,
          isFocusable: false,
        }}
        {receiver}
        {services}
        size="md"
        {unreadMessageCount}
      />
    </a>
  </ContextMenuProvider>
</li>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;

    &:hover {
      cursor: pointer;
      background-color: var(--cc-conversation-preview-background-color--hover);
    }

    &.active {
      background-color: var(--cc-conversation-preview-background-color--active);
    }

    .item {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: start;

      padding: rem(10px) rem(16px);
      text-decoration: inherit;
      color: inherit;

      &:focus-visible {
        box-shadow: inset 0em 0em 0em em(1px) var(--c-icon-button-naked-outer-border-color--focus);
        outline: none;

        &:not(.active) {
          background-color: var(--cc-conversation-preview-background-color--hover);
        }
      }

      :global(.draft) {
        color: var(--cc-conversation-preview-draft-text-color);
      }
    }
  }
</style>
