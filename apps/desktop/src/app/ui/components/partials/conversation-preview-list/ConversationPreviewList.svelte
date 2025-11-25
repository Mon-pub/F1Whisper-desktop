<!--
  @component Renders a list of preview cards for the given conversations.
-->
<script lang="ts" generics="THandlerProps = never">
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import LazyList from '~/app/ui/components/hocs/lazy-list/LazyList.svelte';
  import type {ConversationRouteParams} from '~/app/ui/components/partials/conversation/types';
  import ConversationPreview from '~/app/ui/components/partials/conversation-preview-list/internal/conversation-preview/ConversationPreview.svelte';
  import type {
    ConversationPreviewListItem,
    ConversationPreviewListProps,
  } from '~/app/ui/components/partials/conversation-preview-list/props';
  import {transformContextMenuItemsToContextMenuOptions} from '~/app/ui/components/partials/conversation-preview-list/transformers';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbReceiverLookup} from '~/common/db';
  import {ReceiverType} from '~/common/enum';
  import {TIMER} from '~/common/utils/timer';

  const {
    contextMenuItems,
    highlights,
    items = [],
    onitementereddebounced = () => {},
    services,
  }: ConversationPreviewListProps<THandlerProps> = $props();

  const {router} = services;

  const initiallyVisibleItemId = items?.at(0)?.get().id;

  let routeParams = $state<ConversationRouteParams | undefined>(undefined);

  let containerElement = $state<SvelteNullableBinding<HTMLElement>>(null);
  let lazyListComponent =
    $state<SvelteNullableBinding<LazyList<ConversationPreviewListItem<THandlerProps>>>>(null);

  /**
   * Scrolls the view to the item with the given id. Note: If the item is not already present, the
   * view will not scroll.
   */
  export async function scrollToItem(
    id: ConversationPreviewListItem<THandlerProps>['id'],
    options?: ScrollIntoViewOptions,
  ): Promise<void> {
    return await lazyListComponent?.scrollToItem(id, options);
  }

  function handleChangeRouterState(): void {
    const routerState = router.get();

    if (routerState.main.id === 'conversation') {
      routeParams = routerState.main.params;
    } else {
      // If we are not in a conversation, reset `routeParams` to `undefined` to clear the view.
      routeParams = undefined;
    }
  }

  const handleItemEntered = TIMER.debounce(
    (item: ConversationPreviewListItem<unknown>) => onitementereddebounced(item.id),
    100,
    false,
  );

  function handleClickItem(
    event: MouseEvent,
    receiverLookup: DbReceiverLookup,
    active?: boolean,
  ): void {
    event.preventDefault();

    if (active === true) {
      // Close conversation if it was already open.
      router.goToWelcome();
    } else {
      router.goToConversation({receiverLookup});
    }
  }

  function handleclickjoincall(receiverLookup: DbReceiverLookup): void {
    if (receiverLookup.type !== ReceiverType.GROUP) {
      return;
    }
    router.go({
      activity: ROUTE_DEFINITIONS.activity.call.withParams({receiverLookup, intent: 'join'}),
    });
  }

  $effect(() => {
    reactive(handleChangeRouterState, [$router]);
  });
</script>

<div bind:this={containerElement} class="container">
  {#if items.length === 0}
    <!--Empty `ConversationPreviewList` list-->
  {:else}
    <LazyList
      bind:this={lazyListComponent}
      {items}
      onitementered={handleItemEntered}
      visibleItemId={initiallyVisibleItemId}
    >
      {#snippet snippetItem(item)}
        {@const active =
          routeParams?.receiverLookup.type === item.get().receiver.lookup.type &&
          routeParams.receiverLookup.uid === item.get().receiver.lookup.uid}

        <ConversationPreview
          {active}
          contextMenuOptions={contextMenuItems === undefined
            ? undefined
            : {
                container: containerElement,
                ...transformContextMenuItemsToContextMenuOptions(item, contextMenuItems),
              }}
          {highlights}
          onclick={(event) => handleClickItem(event, item.get().receiver.lookup, active)}
          onclickjoincall={() => handleclickjoincall(item.get().receiver.lookup)}
          {services}
          store={item}
        />
      {/snippet}
    </LazyList>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;

    list-style-type: none;
    margin: 0;
    padding: 0;
    max-width: 100%;
    height: 100%;
  }
</style>
