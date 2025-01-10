<!--
  @component Renders a modal to forward a message to another recipient.
-->
<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import AddressBook from '~/app/ui/components/partials/address-book/AddressBook.svelte';
  import type {TabState} from '~/app/ui/components/partials/address-book/types';
  import type {MessageForwardModalProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-forward-modal/props';
  import {receiverListViewModelStoreToReceiverPreviewListPropsStore} from '~/app/ui/components/partials/receiver-nav/transformers';
  import type {
    ContextMenuItemHandlerProps,
    RemoteReceiverListViewModelStoreValue,
  } from '~/app/ui/components/partials/receiver-nav/types';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbContactUid, DbReceiverLookup} from '~/common/db';
  import type {AnyReceiver, ContactInit} from '~/common/model';
  import type {IdentityString} from '~/common/network/types';
  import {ensureError} from '~/common/utils/assert';
  import type {Remote} from '~/common/utils/endpoint';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';
  import type {ReceiverListViewModelBundle} from '~/common/viewmodel/receiver/list';
  import type {ContactLookupResult} from '~/common/viewmodel/receiver/list/controller';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.message-forward-modal');

  type $$Props = MessageForwardModalProps;

  export let id: $$Props['id'];
  export let receiverLookup: $$Props['receiverLookup'];
  export let services: $$Props['services'];

  const {backend, router} = services;

  // ViewModelBundle containing all receivers.
  let viewModelStore: IQueryableStore<RemoteReceiverListViewModelStoreValue | undefined> =
    new ReadableStore(undefined);
  let viewModelController: Remote<ReceiverListViewModelBundle>['viewModelController'] | undefined =
    undefined;

  let modalComponent: SvelteNullableBinding<Modal> = null;

  let addressBookComponent: SvelteNullableBinding<
    AddressBook<ContextMenuItemHandlerProps<AnyReceiver>>
  > = null;
  let addressBookTabState: TabState = 'contact';

  function handleClickItem(event: CustomEvent<{lookup: DbReceiverLookup}>): void {
    const messageToForward = {
      receiverLookup,
      messageId: id,
    };

    router.goToConversation({
      receiverLookup: event.detail.lookup,
      forwardedMessage: messageToForward,
    });

    modalComponent?.close();
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

  // Current list items.
  $: receiverPreviewListPropsStore = receiverListViewModelStoreToReceiverPreviewListPropsStore(
    viewModelStore,
    addressBookTabState,
  );

  // Filter out the current recipient since forwarding to the same conversation is an operation
  // without use-case.
  $: filteredReceiverPreviewListProps = $receiverPreviewListPropsStore?.filter(
    (item) =>
      item.receiver.type !== 'self' &&
      !(
        item.receiver.lookup.type === receiverLookup.type &&
        item.receiver.lookup.uid === receiverLookup.uid
      ),
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
</script>

<Modal
  bind:this={modalComponent}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onClick: 'close',
      },
    ],
    title: $i18n.t('dialog--forward-message.label--title', 'Select Recipient'),
    maxWidth: 460,
  }}
  on:close
>
  <div class="content">
    <AddressBook
      bind:this={addressBookComponent}
      bind:tabState={addressBookTabState}
      items={filteredReceiverPreviewListProps}
      options={{
        allowReceiverCreation: false,
        allowReceiverEditing: false,
        highlightActiveReceiver: false,
      }}
      {services}
      on:clickitem={handleClickItem}
      actions={{
        createContact,
        lookupContact,
        updateContactAcquaintanceLevelAndName,
      }}
    />
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;

    height: 75vh;
    overflow: hidden;
  }
</style>
