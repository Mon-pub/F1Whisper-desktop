<!--
  @component Renders the receiver navigation sidebar (i.e., the address book).
-->
<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import AddressBook from '~/app/ui/components/partials/address-book/AddressBook.svelte';
  import type {AddressBookState} from '~/app/ui/components/partials/address-book/types';
  import EditContactModal from '~/app/ui/components/partials/modals/edit-contact-modal/EditContactModal.svelte';
  import {receiverListToGroupedAddressBookItems} from '~/app/ui/components/partials/receiver-nav/helpers';
  import TopBar from '~/app/ui/components/partials/receiver-nav/internal/top-bar/TopBar.svelte';
  import type {ReceiverNavProps} from '~/app/ui/components/partials/receiver-nav/props';
  import {receiverListViewModelStoreToReceiverPreviewListItemsStore} from '~/app/ui/components/partials/receiver-nav/transformers';
  import type {
    ContextMenuItemHandlerProps,
    ModalState,
    RemoteReceiverListViewModelStoreValue,
  } from '~/app/ui/components/partials/receiver-nav/types';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {reactive, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbContactUid, DbGroupUid, DbReceiverLookup} from '~/common/db';
  import type {AnyReceiver, ContactInit, GroupInit} from '~/common/model';
  import type {IdentityString} from '~/common/network/types';
  import {ensureError, unreachable} from '~/common/utils/assert';
  import type {Remote} from '~/common/utils/endpoint';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';
  import type {ReceiverListViewModelBundle} from '~/common/viewmodel/receiver/list';
  import type {ContactLookupResult} from '~/common/viewmodel/receiver/list/controller';

  const {uiLogging, hotkeyManager} = globals.unwrap();
  const log = uiLogging.logger('ui.component.receiver-nav');

  const {services}: ReceiverNavProps = $props();

  const {
    backend,
    router,
    settings: {
      views: {appearance},
    },
  } = services;

  let viewModelStore = $state<IQueryableStore<RemoteReceiverListViewModelStoreValue | undefined>>(
    new ReadableStore(undefined),
  );
  let viewModelController = $state<
    Remote<ReceiverListViewModelBundle>['viewModelController'] | undefined
  >(undefined);

  let modalState = $state<ModalState>({type: 'none'});

  let addressBookComponent = $state<SvelteNullableBinding<AddressBook>>(null);
  let addressBookState = $state<AddressBookState | undefined>(undefined);

  function handleHotkeyControlF(): void {
    addressBookComponent?.focusAndSelectSearchBar();
  }

  function handleClickBack(): void {
    router.go({nav: ROUTE_DEFINITIONS.nav.conversationList.withoutParams()});
  }

  function handleClickEditItem(item: ContextMenuItemHandlerProps<AnyReceiver>): void {
    const {receiver} = item.viewModelBundle.viewModelStore.get();
    if (receiver.type !== 'contact') {
      return;
    }

    modalState = {
      type: 'edit-contact',
      props: {
        receiver: {
          ...receiver,
          edit: async (update) => {
            await item.viewModelBundle.viewModelController.edit(update);
          },
        },
        services,
      },
    };
  }

  function handleCloseModal(): void {
    modalState = {
      type: 'none',
    };
  }

  function handleClickReceiverListItem(item: {
    readonly lookup: DbReceiverLookup;
    readonly active: boolean;
  }): void {
    if (item.active) {
      router.goToWelcome();
    } else {
      router.goToConversation({receiverLookup: item.lookup});
    }
  }

  async function updateContactAcquaintanceLevelAndName(
    uid: DbContactUid,
    nameUpdate: {readonly firstName: string; readonly lastName: string},
  ): Promise<void> {
    if (viewModelController === undefined) {
      throw new Error('Error updating contact: The ReceiverListViewModelController was undefined');
    }
    await viewModelController.updateAcquaintanceLevelAndName(uid, nameUpdate);
  }

  async function createContact(contactInit: ContactInit): Promise<DbContactUid | 'race'> {
    if (viewModelController === undefined) {
      throw new Error('Error creating contact: The ReceiverListViewModelController was undefined');
    }
    return await viewModelController.createContact(contactInit);
  }

  async function lookupContact(identityString: IdentityString): Promise<ContactLookupResult> {
    if (viewModelController === undefined) {
      throw new Error(
        'Error looking up contact: The ReceiverListViewModelController was undefined',
      );
    }
    return await viewModelController.lookupContact(identityString);
  }

  async function createGroup(
    groupInit: Pick<GroupInit, 'name'>,
    members: ReadonlySet<DbContactUid>,
  ): Promise<DbGroupUid | undefined> {
    if (viewModelController === undefined) {
      throw new Error('Error creating group: The ReceiverListViewModelController was undefined');
    }
    return await viewModelController.createGroup(groupInit, members);
  }

  function handleChangeRouterState(): void {
    const routerState = $router;

    if (routerState.nav.id === 'receiverList') {
      addressBookState = routerState.nav.params.addressBookState;
    }
  }

  // Current list items.
  const receiverPreviewListItemsStore = $derived(
    receiverListViewModelStoreToReceiverPreviewListItemsStore(viewModelStore),
  );

  const groupedAddressBookItems = $derived(
    receiverListToGroupedAddressBookItems($receiverPreviewListItemsStore, $appearance, log),
  );

  onMount(async () => {
    await backend.viewModel
      .receiverList()
      .then((viewModelBundle) => {
        // Replace `viewModelBundle`.
        viewModelStore = viewModelBundle.viewModelStore;
        viewModelController = viewModelBundle.viewModelController;
      })
      .catch((error: unknown) => {
        log.error(`Failed to load ReceiverListViewModelBundle: ${ensureError(error)}`);

        toast.addSimpleFailure(
          i18n.get().t('contacts.error--contact-list-load', 'Contacts could not be loaded'),
        );
      });
  });

  onMount(() => {
    hotkeyManager.registerHotkey({control: true, code: 'KeyF'}, handleHotkeyControlF);

    return () => {
      hotkeyManager.unregisterHotkey(handleHotkeyControlF);
    };
  });

  $effect(() => {
    reactive(handleChangeRouterState, [$router]);
  });
</script>

<div class="container">
  <AddressBook
    bind:this={addressBookComponent}
    actions={{
      createContact,
      createGroup,
      lookupContact,
      updateContactAcquaintanceLevelAndName,
    }}
    componentState={addressBookState}
    items={groupedAddressBookItems}
    onclickedititem={handleClickEditItem}
    onclickitem={handleClickReceiverListItem}
    {services}
  >
    {#snippet snippetTopbar()}
      <div>
        <TopBar onclickback={handleClickBack} />
      </div>
    {/snippet}
  </AddressBook>
</div>

{#if modalState.type === 'none'}
  <!-- No modal is displayed in this state. -->
{:else if modalState.type === 'edit-contact'}
  <EditContactModal {...modalState.props} onclose={handleCloseModal} />
{:else}
  {unreachable(modalState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    overflow: hidden;
    background-color: var(--t-nav-background-color);
  }
</style>
