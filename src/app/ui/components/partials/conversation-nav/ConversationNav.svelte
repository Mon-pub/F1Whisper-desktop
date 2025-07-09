<!--
  @component Renders the conversation navigation sidebar.
-->
<script lang="ts">
  import {onMount, tick} from 'svelte';

  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import SearchBar from '~/app/ui/components/molecules/search-bar/SearchBar.svelte';
  import {
    conversationListEvent,
    getContextMenuItems,
  } from '~/app/ui/components/partials/conversation-nav/helpers';
  import TopBar from '~/app/ui/components/partials/conversation-nav/internal/top-bar/TopBar.svelte';
  import type {ConversationNavProps} from '~/app/ui/components/partials/conversation-nav/props';
  import {conversationListItemSetStoreToConversationPreviewListPropsStore} from '~/app/ui/components/partials/conversation-nav/transformers';
  import type {
    ModalState,
    ContextMenuItemHandlerProps,
    RemoteConversationListViewModelStoreValue,
    RemoteProfileViewModelStoreValue,
    ConversationPreviewListId,
  } from '~/app/ui/components/partials/conversation-nav/types';
  import ConversationPreviewList from '~/app/ui/components/partials/conversation-preview-list/ConversationPreviewList.svelte';
  import type {ConversationPreviewListItem} from '~/app/ui/components/partials/conversation-preview-list/props';
  import ClearConversationModal from '~/app/ui/components/partials/modals/clear-conversation-modal/ClearConversationModal.svelte';
  import DeleteConversationModal from '~/app/ui/components/partials/modals/delete-conversation-modal/DeleteConversationModal.svelte';
  import DeleteGroupModal from '~/app/ui/components/partials/modals/delete-group-modal/DeleteGroupModal.svelte';
  import SearchResultList from '~/app/ui/components/partials/search-result-list/SearchResultList.svelte';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {MAX_LAZY_CONVERSATION_PREVIEWS} from '~/app/ui/utils/constants';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbReceiverLookup} from '~/common/db';
  import {extractErrorMessage} from '~/common/error';
  import {DEFAULT_CATEGORY} from '~/common/settings';
  import type {i53, u53} from '~/common/types';
  import {assertUnreachable, ensureError, unreachable} from '~/common/utils/assert';
  import {hasProperty} from '~/common/utils/object';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';

  const {uiLogging, hotkeyManager} = globals.unwrap();
  const log = uiLogging.logger('ui.component.conversation-nav');

  const {services}: ConversationNavProps = $props();

  let scrollWindow = $state<{readonly startIndex: u53; readonly endIndex: u53}>({
    startIndex: 0,
    endIndex: MAX_LAZY_CONVERSATION_PREVIEWS,
  });

  const {backend, router} = services;

  // ViewModelBundle of the current conversation.
  let viewModelStore = $state<
    IQueryableStore<RemoteConversationListViewModelStoreValue | undefined>
  >(new ReadableStore(undefined));

  let profileViewModelStore = $state<IQueryableStore<RemoteProfileViewModelStoreValue | undefined>>(
    new ReadableStore(undefined),
  );

  let modalState = $state<ModalState>({type: 'none'});

  let searchBarComponent = $state<SvelteNullableBinding<SearchBar>>(null);
  let searchTerm = $state<string | undefined>(undefined);

  let conversationPreviewListComponent =
    $state<SvelteNullableBinding<ConversationPreviewList<ContextMenuItemHandlerProps>>>(null);
  let searchResultListComponent = $state<SvelteNullableBinding<SearchResultList>>(null);

  let listElement = $state<SvelteNullableBinding<HTMLElement>>(null);

  function handleHotkeyControlF(): void {
    searchBarComponent?.focusAndSelect();
  }

  function handleClickReceiverListButton(): void {
    router.go({
      nav: ROUTE_DEFINITIONS.nav.receiverList.withParams({
        addressBookState: 'receiver-preview-list',
      }),
    });
  }

  function handleClickProfilePicture(): void {
    router.goToSettings({category: DEFAULT_CATEGORY});
  }

  function handleClickSettingsButton(): void {
    router.goToSettings({category: DEFAULT_CATEGORY});
  }

  async function handleClearSearchBar(): Promise<void> {
    await scrollToActiveItem();
  }

  function handleRequestRefreshSearchResults(): void {
    searchResultListComponent?.refresh();
  }

  function handleCloseModal(): void {
    modalState = {
      type: 'none',
    };
  }

  function handleOpenClearModal(
    item: ConversationPreviewListItem<ContextMenuItemHandlerProps>,
    props: ContextMenuItemHandlerProps,
  ): void {
    modalState = {
      type: 'clear-conversation',
      props: {
        conversation: {
          clear: async () => {
            await props.viewModelBundle.viewModelController.clear().catch((error: unknown) => {
              log.error(
                `Clearing conversation failed: ${extractErrorMessage(ensureError(error), 'short')}`,
              );
            });
          },
          totalMessagesCount: item.totalMessageCount,
        },
        receiver: item.receiver,
      },
    };
  }

  function handleOpenDeleteModal(
    item: ConversationPreviewListItem<ContextMenuItemHandlerProps>,
    props: ContextMenuItemHandlerProps,
  ): void {
    // TODO(DESK-1852): Uncomment the following block
    // If this is a left group, deletion means removing it from the database.
    // if (item.receiver.type === 'group' && item.receiver.isLeft) {
    //  modalState = {
    //    type: 'delete-group',
    //    props: {
    //      receiver: {
    //        ...item.receiver,
    //        delete: async () => await props.viewModelBundle.viewModelController.deleteGroup(),
    //      },
    //    },
    //  };
    //  return;
    // }
    //
    modalState = {
      type: 'delete-conversation',
      props: {
        conversation: {
          delete: async () => {
            await props.viewModelBundle.viewModelController.delete().catch((error: unknown) => {
              log.error(
                `Deleting conversation failed: ${extractErrorMessage(ensureError(error), 'short')}`,
              );
            });

            // In case the conversation is open, we need to route back to welcome.
            if (
              $router.main.id === 'conversation' &&
              $router.main.params.receiverLookup.type === item.receiver.lookup.type &&
              $router.main.params.receiverLookup.uid === item.receiver.lookup.uid
            ) {
              router.goToWelcome();
            }
          },
        },
        receiver: item.receiver,
      },
    };
  }

  function handleItemEntered(id: ConversationPreviewListId): void {
    updateScrollWindow({id});
  }

  function updateScrollWindow(
    anchoredItem:
      | {
          id: ConversationPreviewListId;
        }
      | {
          index: i53;
        },
  ): void {
    let targetIndex: i53 | undefined = undefined;
    if (hasProperty(anchoredItem, 'id')) {
      targetIndex = $conversationPreviewListProps?.items.findIndex(
        (item) => item.get().id === anchoredItem.id,
      );
    } else {
      targetIndex = anchoredItem.index;
    }

    // Do nothing if the index is invalid or the item was not found.
    if (targetIndex === undefined || targetIndex < 0) {
      return;
    }

    // Calculate start and end indices such that `targetIndex` is roughly near the middle of the
    // window.
    const start = Math.max(targetIndex - Math.floor(MAX_LAZY_CONVERSATION_PREVIEWS / 2), 0);
    const end = start + MAX_LAZY_CONVERSATION_PREVIEWS;

    scrollWindow = {
      startIndex: start,
      endIndex: end,
    };
  }

  async function scrollToFirstConversation(): Promise<void> {
    const firstItem = $conversationPreviewListProps?.items.at(0)?.get();
    if (firstItem === undefined) {
      return;
    }

    updateScrollWindow({index: 0});
    try {
      await tick();
      await conversationPreviewListComponent?.scrollToItem(firstItem.id, {
        behavior: 'instant',
        block: 'start',
      });
    } catch (error: unknown) {
      log.error('Error scrolling to top in ConversationNav: ', error);
    }
  }

  async function scrollToConversation(lookup: DbReceiverLookup): Promise<void> {
    let targetItemIndex: i53 | undefined = undefined;
    const targetItem = $conversationPreviewListProps?.items
      .find((item, index) => {
        if (
          item.get().receiver.lookup.type === lookup.type &&
          item.get().receiver.lookup.uid === lookup.uid
        ) {
          targetItemIndex = index;

          return true;
        }

        return false;
      })
      ?.get();
    if (targetItem === undefined || targetItemIndex === undefined) {
      return;
    }

    updateScrollWindow({index: targetItemIndex});
    try {
      await tick();
      await conversationPreviewListComponent?.scrollToItem(targetItem.id, {
        behavior: 'instant',
        block: 'start',
      });
    } catch (error) {
      log.error('ConversationNav: Error scrolling to item: ', error);
    }
  }

  async function scrollToActiveItem(): Promise<void> {
    const routerState = router.get();

    if (routerState.main.id === 'conversation') {
      await scrollToConversation(routerState.main.params.receiverLookup);
    }
  }

  // Current search results.
  const conversationSearchResults = $derived($viewModelStore?.listItemSetStore);
  const conversationPreviewListProps = $derived(
    conversationSearchResults === undefined
      ? undefined
      : conversationListItemSetStoreToConversationPreviewListPropsStore(conversationSearchResults),
  );

  const currentPreviewList = $derived.by(() => {
    if ($conversationPreviewListProps === undefined) {
      return [];
    }
    if ($conversationPreviewListProps.items.length <= MAX_LAZY_CONVERSATION_PREVIEWS) {
      return $conversationPreviewListProps.items;
    }

    return $conversationPreviewListProps.items.slice(
      scrollWindow.startIndex,
      scrollWindow.endIndex,
    );
  });

  onMount(async () => {
    await backend.viewModel
      .conversationList()
      .then((viewModelBundle) => {
        // Replace `viewModelBundle`.
        viewModelStore = viewModelBundle.viewModelStore;
      })
      .catch((error: unknown) => {
        log.error(`Failed to load ConversationListViewModelBundle: ${ensureError(error)}`);

        toast.addSimpleFailure(
          i18n.get().t('messaging.error--conversation-list-load', 'Chats could not be loaded'),
        );
      });

    await backend.viewModel
      .profile()
      .then((store) => {
        // Replace `profileViewModelStore`.
        profileViewModelStore = store;
      })
      .catch((error: unknown) => {
        log.error(`Failed to load ProfileViewModel: ${ensureError(error)}`);
      });

    await scrollToActiveItem();
  });

  onMount(() => {
    hotkeyManager.registerHotkey({control: true, code: 'KeyF'}, handleHotkeyControlF);

    return () => {
      hotkeyManager.unregisterHotkey(handleHotkeyControlF);
    };
  });

  onMount(() => {
    // Process conversation nav events.
    conversationListEvent.attach((eventType) => {
      switch (eventType.action) {
        case 'scroll-to-top':
          scrollToFirstConversation().catch(assertUnreachable);
          break;

        default:
          unreachable(eventType.action);
      }
    });

    return () => conversationListEvent.detach();
  });
</script>

<div class="container">
  <div class="top-bar">
    <!-- eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -->
    {#if $profileViewModelStore !== undefined}
      <TopBar
        initials={$profileViewModelStore.initials}
        onclickprofilepicture={handleClickProfilePicture}
        onclickreceiverlistbutton={handleClickReceiverListButton}
        onclicksettingsbutton={handleClickSettingsButton}
        profilePicture={$profileViewModelStore.profilePicture}
        {services}
      />
    {/if}
  </div>

  <div class="search">
    <SearchBar
      bind:this={searchBarComponent}
      bind:term={searchTerm}
      onclear={handleClearSearchBar}
      onrequestrefresh={handleRequestRefreshSearchResults}
      placeholder={$i18n.t('search.label--search-input-placeholder', 'Search...')}
    />
  </div>

  <div bind:this={listElement} class="list">
    {#if currentPreviewList.length > 0}
      {#if searchTerm === undefined || searchTerm === ''}
        <ConversationPreviewList
          bind:this={conversationPreviewListComponent}
          contextMenuItems={(item) =>
            getContextMenuItems(item, $i18n, log, handleOpenClearModal, handleOpenDeleteModal)}
          items={currentPreviewList}
          onitementereddebounced={handleItemEntered}
          {services}
        />
      {:else}
        <SearchResultList bind:this={searchResultListComponent} {searchTerm} {services} />
      {/if}
    {:else}
      <!-- No chats. -->
    {/if}
  </div>
</div>

{#if modalState.type === 'none'}
  <!-- No modal is displayed in this state. -->
{:else if modalState.type === 'clear-conversation'}
  <ClearConversationModal {...modalState.props} onclose={handleCloseModal} />
{:else if modalState.type === 'delete-conversation'}
  <DeleteConversationModal {...modalState.props} onclose={handleCloseModal} />
{:else if modalState.type === 'delete-group'}
  <DeleteGroupModal {...modalState.props} onclose={handleCloseModal} />
{:else}
  {unreachable(modalState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    overflow: hidden;
    background-color: var(--t-nav-background-color);
    grid-template:
      'top-bar' rem(64px)
      'search' rem(52px)
      'list' 1fr
      / 100%;

    .top-bar {
      grid-area: top-bar;

      padding: rem(12px) rem(8px) rem(16px) rem(16px);
    }

    .search {
      grid-area: search;

      padding: 0 rem(16px) rem(12px);
    }

    .list {
      grid-area: list;

      overflow-y: auto;
    }
  }
</style>
