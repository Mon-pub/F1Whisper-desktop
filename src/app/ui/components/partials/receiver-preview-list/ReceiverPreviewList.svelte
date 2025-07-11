<!--
  @component Renders a list of preview cards for the given receivers.
-->
<script lang="ts" generics="THandlerProps = never">
  import LazyList from '~/app/ui/components/hocs/lazy-list/LazyList.svelte';
  import type {ConversationRouteParams} from '~/app/ui/components/partials/conversation/types';
  import ReceiverPreview from '~/app/ui/components/partials/receiver-preview-list/internal/receiver-preview/ReceiverPreview.svelte';
  import type {
    ReceiverPreviewListItem,
    ReceiverPreviewListProps,
  } from '~/app/ui/components/partials/receiver-preview-list/props';
  import {transformContextMenuItemsToContextMenuOptions} from '~/app/ui/components/partials/receiver-preview-list/transformers';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';

  const {
    contextMenuItems = undefined,
    highlights = undefined,
    items = [],
    onclickitem,
    onselectitem,
    options = {},
    services,
  }: ReceiverPreviewListProps<THandlerProps> = $props();

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
    active: boolean,
    item: ReceiverPreviewListItem<THandlerProps>,
  ): void {
    event.preventDefault();

    if (item.receiver.type === 'self') {
      return;
    }

    onclickitem?.({lookup: item.receiver.lookup, active});
  }

  function handleSelectItem(selected: boolean, item: ReceiverPreviewListItem<THandlerProps>): void {
    if (item.receiver.type === 'self') {
      return;
    }

    onselectitem?.(selected, {lookup: item.receiver.lookup});
  }

  $effect(() => {
    reactive(handleChangeRouterState, [$router]);
  });
</script>

<div bind:this={containerElement} class="container">
  {#if items.length === 0}
    <!--Empty `ConversationPreviewList` list-->
  {:else}
    <LazyList {items}>
      {#snippet snippetItem(item)}
        {@const {receiver, interaction} = item.get()}
        {@const active =
          receiver.type === 'self'
            ? false
            : routeParams?.receiverLookup.type === receiver.lookup.type &&
              routeParams.receiverLookup.uid === receiver.lookup.uid}

        <ReceiverPreview
          active={active && options.highlightActiveReceiver !== false}
          contextMenuOptions={contextMenuItems === undefined
            ? undefined
            : {
                container: containerElement,
                ...transformContextMenuItemsToContextMenuOptions(item, contextMenuItems),
              }}
          {highlights}
          interaction={// eslint-disable-next-line no-nested-ternary
          interaction?.mode === 'click'
            ? {
                ...interaction,
                onclick: (event) => {
                  interaction.onclick?.(event);
                  handleClickItem(event, active, item.get());
                },
              }
            : interaction?.mode === 'select'
              ? {
                  ...interaction,
                  onselect: (selected) => {
                    interaction.onselect?.(selected);
                    handleSelectItem(selected, item.get());
                  },
                }
              : {mode: 'none'}}
          options={{
            highlightWhenActive: options.highlightActiveReceiver,
          }}
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
    overflow: hidden;

    list-style-type: none;
    margin: 0;
    padding: 0;
    max-width: 100%;
  }
</style>
