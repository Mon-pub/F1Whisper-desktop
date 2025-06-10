<!--
  @component Renders a list of preview cards for the given conversations.
-->
<script lang="ts" generics="THandlerProps = never">
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import type {ConversationRouteParams} from '~/app/ui/components/partials/conversation/types';
  import ConversationPreview from '~/app/ui/components/partials/conversation-preview-list/internal/conversation-preview/ConversationPreview.svelte';
  import type {ConversationPreviewListProps} from '~/app/ui/components/partials/conversation-preview-list/props';
  import {transformContextMenuItemsToContextMenuOptions} from '~/app/ui/components/partials/conversation-preview-list/transformers';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbReceiverLookup} from '~/common/db';
  import {ReceiverType} from '~/common/enum';

  const {
    contextMenuItems,
    highlights,
    items = [],
    services,
  }: ConversationPreviewListProps<THandlerProps> = $props();

  const {router} = services;

  let routeParams = $state<ConversationRouteParams | undefined>(undefined);

  let containerElement = $state<SvelteNullableBinding<HTMLElement>>(null);

  function handleChangeRouterState(): void {
    const routerState = router.get();

    if (routerState.main.id === 'conversation') {
      routeParams = routerState.main.params;
    } else {
      // If we are not in a conversation, reset `routeParams` to `undefined` to clear the view.
      routeParams = undefined;
    }
  }

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

<ul bind:this={containerElement} class="container">
  {#each items as itemStore (itemStore.get().receiver.id)}
    {@const active =
      routeParams?.receiverLookup.type === itemStore.get().receiver.lookup.type &&
      routeParams.receiverLookup.uid === itemStore.get().receiver.lookup.uid}

    <ConversationPreview
      {active}
      contextMenuOptions={contextMenuItems === undefined
        ? undefined
        : {
            container: containerElement,
            ...transformContextMenuItemsToContextMenuOptions(itemStore, contextMenuItems),
          }}
      {highlights}
      onclick={(event) => handleClickItem(event, itemStore.get().receiver.lookup, active)}
      onclickjoincall={() => handleclickjoincall(itemStore.get().receiver.lookup)}
      {services}
      store={itemStore}
    />
  {/each}
</ul>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    overflow: hidden;

    list-style-type: none;
    margin: 0;
    padding: 0;
    min-height: 100%;
    max-width: 100%;
  }
</style>
