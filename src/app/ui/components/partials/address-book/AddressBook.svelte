<!--
  @component Renders an address book containing the user's contacts.
-->
<script lang="ts">
  import {tick} from 'svelte';

  import {globals} from '~/app/globals';
  import SearchBar from '~/app/ui/components/molecules/search-bar/SearchBar.svelte';
  import TabBar from '~/app/ui/components/molecules/tab-bar/TabBar.svelte';
  import type {TabBarProps} from '~/app/ui/components/molecules/tab-bar/props';
  import {
    getSearchInputPlaceholderForTabState,
    isReceiverMatchingSearchTerm,
  } from '~/app/ui/components/partials/address-book/helpers';
  import type {AddressBookProps} from '~/app/ui/components/partials/address-book/props';
  import type {TabState} from '~/app/ui/components/partials/address-book/types';
  import ContactAddForm from '~/app/ui/components/partials/contact-add-form/ContactAddForm.svelte';
  import GroupAddForm from '~/app/ui/components/partials/group-add-form/GroupAddForm.svelte';
  import type {ContextMenuItemHandlerProps} from '~/app/ui/components/partials/receiver-nav/types';
  import ReceiverPreviewList from '~/app/ui/components/partials/receiver-preview-list/ReceiverPreviewList.svelte';
  import type {
    ReceiverPreviewListItem,
    ContextMenuItemWithHandlerProps,
    ReceiverPreviewListProps,
  } from '~/app/ui/components/partials/receiver-preview-list/props';
  import {i18n} from '~/app/ui/i18n';
  import type {I18nType} from '~/app/ui/i18n-types';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import {scrollIntoViewIfNeededAsync} from '~/app/ui/utils/scroll';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbReceiverLookup} from '~/common/db';
  import type {AnyReceiver} from '~/common/model';
  import type {Contact} from '~/common/model/types/contact';
  import type {Group} from '~/common/model/types/group';
  import {unreachable} from '~/common/utils/assert';
  import type {IQueryableStore} from '~/common/utils/store';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.address-book');

  let {
    actions,
    componentState = 'receiver-preview-list',
    items = {contacts: [], groups: [], workSubscriptionContacts: []},
    onclickedititem,
    onclickitem,
    options = {},
    services,
    snippetTopbar,
  }: AddressBookProps = $props();

  const {router} = services;

  let tabState: TabState = $state('contacts');

  const {
    allowReceiverCreation = true,
    allowReceiverEditing = true,
    highlightActiveReceiver = true,
  } = $derived(options);

  let searchBarComponent = $state<SvelteNullableBinding<SearchBar>>(null);
  let searchTerm = $state<string | undefined>(undefined);
  let listElement = $state<SvelteNullableBinding<HTMLElement>>(null);

  /**
   * Set focus to the search bar input element and select its contents.
   */
  export function focusAndSelectSearchBar(): void {
    searchBarComponent?.focusAndSelect();
  }

  /**
   * Scroll to the list item of the receiver that matches the given `lookup`.
   */
  export async function scrollToItem(lookup: DbReceiverLookup): Promise<void> {
    await scrollIntoViewIfNeededAsync({
      container: listElement,
      element: listElement?.querySelector(`ul > li[data-receiver="${lookup.type}.${lookup.uid}"]`),
      options: {
        behavior: 'instant',
        block: 'start',
      },
      timeoutMs: 100,
    }).catch((error: unknown) => {
      log.info(`Scroll to receiver was not performed: ${error}`);
    });
  }

  /**
   * Scroll to the list item of the receiver whose conversation is currently open.
   */
  export async function scrollToActiveItem(): Promise<void> {
    const routerState = router.get();

    if (routerState.main.id === 'conversation') {
      await scrollToItem(routerState.main.params.receiverLookup);
    }
  }

  function handleClickTab(newTabState: TabState): void {
    tabState = newTabState;
  }

  async function handleClearSearchBar(): Promise<void> {
    /*
     * Wait for any pending state changes to be applied before scrolling to the active conversation,
     * because it might not be rendered before that (e.g., if a filter has been applied).
     */
    await tick();
    await scrollToActiveItem();
  }

  function handleClickAddContact(): void {
    componentState = 'contact-add-form';
  }

  function handleClickAddGroup(): void {
    componentState = 'group-add-form';
    searchTerm = '';
  }

  function getTabBarTabs(): TabBarProps<TabState>['tabs'] {
    return [
      {
        id: 'contacts',
        icon: 'person',
        onclick: handleClickTab,
      },
      {
        id: 'groups',
        icon: 'group',
        onclick: handleClickTab,
      },
      ...(import.meta.env.BUILD_VARIANT === 'work' || import.meta.env.BUILD_VARIANT === 'custom'
        ? [
            {
              id: 'workSubscriptionContacts',
              icon: 'work_outline',
              onclick: handleClickTab,
            } as const,
          ]
        : []),
    ];
  }

  function getContextMenuItems(
    receiverPreviewListItem: ReceiverPreviewListItem<ContextMenuItemHandlerProps<AnyReceiver>>,
    currentAllowReceiverEditing: boolean,
    t: I18nType['t'],
  ): ContextMenuItemWithHandlerProps<ContextMenuItemHandlerProps<AnyReceiver>>[] {
    if (!currentAllowReceiverEditing) {
      // Don't show a context menu if editing is not allowed, as there are no other options at this time.
      return [];
    }

    switch (receiverPreviewListItem.receiver.type) {
      case 'contact':
        return [
          {
            type: 'option',
            disabled: false,
            handler: (props) => onclickedititem?.(props),
            label: t('contacts.action--edit', 'Edit'),
            icon: {
              name: 'edit',
            },
          },
        ];

      case 'distribution-list':
      case 'group':
      case 'self':
        // Don't show a context menu for group and distribution-list receivers at this time.
        return [];

      default:
        return unreachable(receiverPreviewListItem.receiver);
    }
  }

  function getFilteredPreviewListItems(
    currentTab: TabState,
    currentItems: typeof items,
    currentSearchTerm: typeof searchTerm,
  ): ReceiverPreviewListProps<ContextMenuItemHandlerProps<AnyReceiver>>['items'] {
    function filterItems(
      itemStore:
        | IQueryableStore<ReceiverPreviewListItem<ContextMenuItemHandlerProps<Contact>>>
        | IQueryableStore<ReceiverPreviewListItem<ContextMenuItemHandlerProps<Group>>>,
      // TODO(DESK-236) Add distribution lists here.
    ): boolean {
      const item = itemStore.get();

      // Receivers of type "self" don't make sense in the address book. In practice, this case
      // should never happen, but if such items are provided, we'll filter them out.
      if (item.receiver.type === 'self') {
        return false;
      }

      // Filter items by `searchTerm`.
      if (currentSearchTerm !== undefined && currentSearchTerm !== '') {
        return isReceiverMatchingSearchTerm(item.receiver, currentSearchTerm);
      }

      return true;
    }

    return currentItems[currentTab].filter(filterItems) as ReceiverPreviewListProps<
      ContextMenuItemHandlerProps<AnyReceiver>
    >['items'];
  }

  function resetStateToDefault(tabState_: TabState): void {
    componentState = 'receiver-preview-list';
    tabState = tabState_;
  }

  const filteredPreviewListItems = $derived(
    getFilteredPreviewListItems(tabState, items, searchTerm),
  );
</script>

{#if componentState === 'receiver-preview-list'}
  <div class="container">
    {#if snippetTopbar}
      {@render snippetTopbar?.()}
    {/if}
    <div class="tab-bar">
      <TabBar tabs={getTabBarTabs()} initiallySelectedId={tabState} />
    </div>

    <div class="search">
      <SearchBar
        bind:this={searchBarComponent}
        bind:term={searchTerm}
        onclear={handleClearSearchBar}
        placeholder={getSearchInputPlaceholderForTabState(tabState, $i18n.t)}
      />
    </div>

    {#if allowReceiverCreation && (import.meta.env.BUILD_VARIANT === 'consumer' || import.meta.env.BUILD_ENVIRONMENT === 'sandbox') && tabState === 'contacts'}
      <button class="add" onclick={handleClickAddContact}>
        <div class="icon">
          <MdIcon theme="Filled">add</MdIcon>
        </div>
        <div class="text">
          {$i18n.t('contacts.action--add-contact', 'New Contact')}
        </div>
      </button>
    {/if}

    {#if allowReceiverCreation && (import.meta.env.BUILD_VARIANT === 'consumer' || import.meta.env.BUILD_ENVIRONMENT === 'sandbox') && tabState === 'groups'}
      <button class="add" onclick={handleClickAddGroup}>
        <div class="icon">
          <MdIcon theme="Filled">add</MdIcon>
        </div>
        <div class="text">
          {$i18n.t('groups.action--add-group', 'New Group')}
        </div>
      </button>
    {/if}

    <div bind:this={listElement} class="list">
      {#if filteredPreviewListItems.length > 0}
        <ReceiverPreviewList
          contextMenuItems={(receiverPreviewListItem) =>
            getContextMenuItems(receiverPreviewListItem, allowReceiverEditing, $i18n.t)}
          highlights={searchTerm}
          items={filteredPreviewListItems}
          {onclickitem}
          options={{
            highlightActiveReceiver,
          }}
          {services}
        />
      {:else}
        <!-- No receivers. -->
      {/if}
    </div>
  </div>
{:else if componentState === 'contact-add-form'}
  <ContactAddForm
    {actions}
    onclickback={() => resetStateToDefault('contacts')}
    onclickcancel={() => resetStateToDefault('contacts')}
    oncreatesuccess={() => resetStateToDefault('contacts')}
    {services}
  />
{:else if componentState === 'group-add-form'}
  <GroupAddForm
    {services}
    contacts={items.contacts}
    {actions}
    onclickback={() => resetStateToDefault('groups')}
    onclickcancel={() => resetStateToDefault('groups')}
  />
{:else}
  {unreachable(componentState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    overflow: hidden;
    max-height: 100%;
    max-width: 100%;

    grid-template:
      'top-bar' min-content
      'tab-bar' min-content
      'search' min-content
      'add' min-content
      'list' 1fr
      / 100%;

    .tab-bar {
      grid-area: tab-bar;

      padding: 0 rem(16px) rem(16px);
    }

    .search {
      grid-area: search;

      padding: 0 rem(16px) rem(12px);
    }

    .add {
      @include def-var(--c-icon-font-size, #{rem(24px)});
      @extend %neutral-input;

      & {
        grid-area: add;

        padding: 0 rem(16px) rem(4px);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: start;
        gap: rem(8px);
      }

      .icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: rem(48px);
        height: rem(48px);
        border-radius: 50%;
        color: var(--t-color-primary);
      }

      &:hover {
        .icon {
          background-color: var(--cc-menu-item-icon-text-background-color--hover);
        }
      }

      &:active {
        .icon {
          background-color: var(--cc-menu-item-icon-text-background-color--active);
        }
      }
    }

    .list {
      grid-area: list;

      overflow-y: auto;
    }
  }
</style>
