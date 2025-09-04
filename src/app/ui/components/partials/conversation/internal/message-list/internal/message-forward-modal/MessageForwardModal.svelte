<!--
  @component Renders a modal to forward a message to another recipient.
-->
<script lang="ts">
  import {onMount} from 'svelte';
  import {SvelteSet} from 'svelte/reactivity';

  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import AddressBook from '~/app/ui/components/partials/address-book/AddressBook.svelte';
  import type {MessageForwardModalProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-forward-modal/props';
  import {receiverListViewModelStoreToReceiverPreviewListItemsStore} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-forward-modal/transformers';
  import {receiverListToGroupedAddressBookItems} from '~/app/ui/components/partials/receiver-nav/helpers';
  import type {RemoteReceiverListViewModelStoreValue} from '~/app/ui/components/partials/receiver-nav/types';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {DbGroupUid, DbContactUid, DbReceiverLookup} from '~/common/db';
  import {ReceiverType} from '~/common/enum';
  import type {ContactInit} from '~/common/model';
  import type {IdentityString, MessageId} from '~/common/network/types';
  import {ensureError, unreachable} from '~/common/utils/assert';
  import type {Remote} from '~/common/utils/endpoint';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';
  import {derive} from '~/common/utils/store/derived-store';
  import type {ReceiverListViewModelBundle} from '~/common/viewmodel/receiver/list';
  import type {ContactLookupResult} from '~/common/viewmodel/receiver/list/controller';
  import type {AnyReceiverDataOrSelf} from '~/common/viewmodel/utils/receiver';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.message-forward-modal');

  const {id, onclose, receiverLookup, services}: MessageForwardModalProps = $props();
  const {
    backend,
    router,
    settings: {
      views: {appearance},
    },
  } = services;

  const selectedContacts = new SvelteSet<DbContactUid>();
  const selectedGroups = new SvelteSet<DbGroupUid>();

  // ViewModelBundle containing all receivers.
  let viewModelStore = $state<IQueryableStore<RemoteReceiverListViewModelStoreValue | undefined>>(
    new ReadableStore(undefined),
  );
  let viewModelController = $state<
    Remote<ReceiverListViewModelBundle>['viewModelController'] | undefined
  >(undefined);

  let submitButtonLoading = $state(false);

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);

  let addressBookComponent = $state<SvelteNullableBinding<AddressBook>>(null);

  function handleSelectReceiver(selected: boolean, receiver: AnyReceiverDataOrSelf): void {
    switch (receiver.type) {
      case 'self':
      case 'distribution-list':
        log.debug('GroupAddForm receiver list should only contain contacts');
        break;

      case 'contact':
        if (!selected) {
          selectedContacts.delete(receiver.lookup.uid);
        } else {
          selectedContacts.add(receiver.lookup.uid);
        }
        break;

      case 'group':
        if (!selected) {
          selectedGroups.delete(receiver.lookup.uid);
        } else {
          selectedGroups.add(receiver.lookup.uid);
        }
        break;

      default:
        unreachable(receiver);
    }
  }

  function isReceiverSelected(receiver: AnyReceiverDataOrSelf): boolean {
    switch (receiver.type) {
      case 'self':
      case 'distribution-list':
        log.debug('GroupAddForm receiver list should only contain contacts');
        return false;

      case 'contact':
        return selectedContacts.has(receiver.lookup.uid);

      case 'group':
        return selectedGroups.has(receiver.lookup.uid);

      default:
        return unreachable(receiver);
    }
  }

  async function handleSubmit(): Promise<void> {
    const lookups = [
      ...[...selectedContacts].map((uid) => ({type: ReceiverType.CONTACT, uid}) as const),
      ...[...selectedGroups].map((uid) => ({type: ReceiverType.GROUP, uid}) as const),
    ];

    if (viewModelController === undefined) {
      log.error('Cannot forward message, viewmodelcontroller is undefined');
      return;
    }

    submitButtonLoading = true;

    // Because Svelte `$state` uses proxies under the hood, values need to be unwrapped using
    // `$state.snapshot` to make them usable outside of Svelte contexts.
    const messageToForward = $state.snapshot({
      lookup: receiverLookup,
      messageId: id,
    }) as unknown as {
      readonly lookup: DbReceiverLookup;
      readonly messageId: MessageId;
    };

    await viewModelController
      .forwardMessage(messageToForward, lookups)
      .then(() => {
        toast.addSimpleSuccess(
          $i18n.t('dialog--forward-message.label--success', 'Message successfully forwarded'),
        );

        // If we only forwarded to one receiver, we can open this chat.
        if (lookups.length === 1) {
          router.goToConversation({
            receiverLookup: $state.snapshot(lookups[0]) as unknown as DbReceiverLookup,
          });
        }

        modalComponent?.close();
      })
      .catch((error) => {
        log.error('An error occurred when forwarding message:', ensureError(error));
        toast.addSimpleFailure(
          $i18n.t(
            'dialog--forward-message.error--forwarding-failed',
            'Failed to forward the message',
          ),
        );
        modalComponent?.close();
        router.goToWelcome();
      });

    submitButtonLoading = false;
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
  const receiverPreviewListItemsStore = $derived(
    receiverListViewModelStoreToReceiverPreviewListItemsStore(viewModelStore),
  );

  const groupedAddressBookItems = $derived(
    receiverListToGroupedAddressBookItems(
      $receiverPreviewListItemsStore
        ?.filter((itemStore) => {
          const item = itemStore.get();
          // Exclude `self`.
          if (item.receiver.type === 'self') {
            return false;
          }

          // Exclude receiver of original message to forward.
          if (
            item.receiver.lookup.type === receiverLookup.type &&
            item.receiver.lookup.uid === receiverLookup.uid
          ) {
            return false;
          }

          // Filter blocked contacts.
          if (item.receiver.type === 'contact' && item.receiver.isBlocked) {
            return false;
          }

          return true;
        })
        .map((itemStore) =>
          derive([itemStore], ([{currentValue}]) => ({
            ...currentValue,
            interaction: {
              mode: 'select',
              isSelected: isReceiverSelected(currentValue.receiver),
              onselect: (selected: boolean) =>
                handleSelectReceiver(selected, currentValue.receiver),
            },
          })),
        ),
      $appearance,
      log,
      {filterLeftGroups: true, filterInvalidContacts: true},
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
          $i18n.t('contacts.error--contact-list-load', 'Receivers could not be loaded'),
        );
      });
  });
</script>

<Modal
  bind:this={modalComponent}
  {onclose}
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
    buttons: [
      {
        label: $i18n.t('dialog--common.action--cancel', 'Cancel'),
        type: 'naked',
        onclick: 'close',
      },
      {
        label: $i18n.t('dialog--forward-message.label--submit', 'Forward Message'),
        type: 'filled',
        onclick: handleSubmit,
        state: submitButtonLoading ? 'loading' : 'default',
      },
    ],
    title: $i18n.t('dialog--forward-message.label--title', 'Select Recipient'),
    maxWidth: 460,
  }}
>
  <div class="content">
    <AddressBook
      bind:this={addressBookComponent}
      items={groupedAddressBookItems}
      options={{
        allowReceiverCreation: false,
        allowReceiverEditing: false,
        highlightActiveReceiver: false,
      }}
      {services}
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
