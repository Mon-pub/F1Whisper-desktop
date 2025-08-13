<script lang="ts">
  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import SearchBar from '~/app/ui/components/molecules/search-bar/SearchBar.svelte';
  import {isReceiverMatchingSearchTerm} from '~/app/ui/components/partials/address-book/helpers';
  import type {EditGroupMembersModalProps} from '~/app/ui/components/partials/modals/edit-group-members-modal/props';
  import {groupEditViewModelStoreToContactList} from '~/app/ui/components/partials/modals/edit-group-members-modal/transformers';
  import type {
    EditGroupMembersRouteParams,
    RemoteGroupEditViewModelController,
    RemoteGroupEditViewModelStoreValue,
  } from '~/app/ui/components/partials/modals/edit-group-members-modal/types';
  import ReceiverPreviewList from '~/app/ui/components/partials/receiver-preview-list/ReceiverPreviewList.svelte';
  import type {
    ReceiverPreviewListItem,
    ReceiverPreviewListProps,
  } from '~/app/ui/components/partials/receiver-preview-list/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {reactive} from '~/app/ui/utils/svelte';
  import type {DbContactUid, DbGroupReceiverLookup} from '~/common/db';
  import {assert, assertUnreachable} from '~/common/utils/assert';
  import {difference} from '~/common/utils/set';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';
  import {derive} from '~/common/utils/store/derived-store';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.edit-group-members-modal');

  const {services}: EditGroupMembersModalProps = $props();

  // Represent the selection as done by the user in the frontend. Reactivity is skipped on purpose.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const addedMembers = new Set<DbContactUid>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const removedMembers = new Set<DbContactUid>();

  const {
    backend,
    router,
    settings: {
      views: {appearance},
    },
  } = services;

  let routeParams: EditGroupMembersRouteParams | undefined = $state<
    EditGroupMembersRouteParams | undefined
  >(undefined);

  let searchTerm = $state<string | undefined>(undefined);

  // ViewModelBundle containing all receivers.
  let viewModelStore = $state<IQueryableStore<RemoteGroupEditViewModelStoreValue | undefined>>(
    new ReadableStore(undefined),
  );
  let viewModelController = $state<RemoteGroupEditViewModelController | undefined>(undefined);

  let submitButtonLoading = $state(false);

  function handleChangeRouterState(): void {
    const routerState = $router;
    if (routerState.modal?.id === 'editGroupMembers') {
      routeParams = routerState.modal.params;
    } else {
      // If no detail is open, reset `routeParams` to `undefined` to clear the view.
      routeParams = undefined;
    }
  }

  async function handleChangeRouteParams(): Promise<void> {
    let receiver: DbGroupReceiverLookup | undefined = undefined;
    if (routeParams !== undefined) {
      receiver = routeParams;
    }

    // If the receiver is the same, it's not necessary to reload the `viewModelBundle`.
    if (
      receiver !== undefined &&
      receiver.type === $viewModelStore?.groupReceiverData.lookup.type &&
      receiver.uid === $viewModelStore?.groupReceiverData.lookup.uid
    ) {
      return;
    }

    // If the receiver is undefined, reset `viewModelStore` and `viewModelController`.
    if (receiver === undefined) {
      viewModelStore = new ReadableStore(undefined);
      viewModelController = undefined;
      return;
    }

    const unproxiedReceiver = $state.snapshot(routeParams) as unknown as DbGroupReceiverLookup;

    await backend.viewModel.groupEdit(unproxiedReceiver).then((viewModelBundle) => {
      if (viewModelBundle === undefined) {
        throw new Error('ViewModelBundle returned by the repository was undefined');
      }

      // If the user is not the creator, show a toast and route away.
      if (viewModelBundle.viewModelStore.get()?.groupReceiverData.creator.type !== 'self') {
        toast.addSimpleFailure(
          $i18n.t(
            'groups.error--group-edit-not-creator',
            'You cannot edit the group because you are not the creator',
          ),
        );
        router.go({...$router, modal: 'close'});
      }

      viewModelStore = viewModelBundle.viewModelStore;
      viewModelController = viewModelBundle.viewModelController;
    });
  }

  function closeModal(): void {
    router.go({...$router, modal: 'close'});
  }

  async function setGroupMembers(): Promise<void> {
    if (viewModelController === undefined) {
      log.error('Error editing group members: The GroupEditController was undefined');
      return;
    }

    // Evaluate the difference and return early if nothing changed.
    const membersDiff = diffCurrentMembers();
    const equalSetSize = membersDiff.size === currentGroupMembers.size;
    let equalSets = equalSetSize;
    if (equalSetSize) {
      for (const member of membersDiff) {
        if (!currentGroupMembers.has(member)) {
          equalSets = false;
          break;
        }
      }
    }
    if (equalSets) {
      closeModal();
      return;
    }

    submitButtonLoading = true;

    await viewModelController
      .setMembers(diffCurrentMembers())
      .then((success) => {
        if (success) {
          toast.addSimpleSuccess(
            $i18n.t(
              'dialog--edit-group.success--edit-group-members',
              'Group members successfully edited',
            ),
          );
          closeModal();
          return;
        }
        toast.addSimpleFailure(
          $i18n.t('dialog--edit-group.error--edit-group-members', 'Failed to edit group members'),
        );
      })
      .catch((error) => {
        log.error(`Failed to update group: ${error}`);

        toast.addSimpleFailure(
          $i18n.t('dialog--edit-group.error--edit-group-members', 'Failed to edit group members'),
        );
      });

    submitButtonLoading = true;
  }

  function diffCurrentMembers(): Set<DbContactUid> {
    return difference(new Set([...currentGroupMembers, ...addedMembers]), removedMembers);
  }

  function filterCurrentMembers(
    receiverPreviewList: ReceiverPreviewListProps<unknown>['items'] | undefined,
    currentSearchTerm: string | undefined,
    currentSelectedMembers: ReadonlySet<DbContactUid>,
  ): ReceiverPreviewListProps<unknown>['items'] | undefined {
    return receiverPreviewList
      ?.filter((itemStore) => {
        const item = itemStore.get();
        // The viewmodel only delivers contacts anyway, but to be sure we filter all others out
        // anyway.
        if (item.receiver.type !== 'contact') {
          return false;
        }

        if (currentSearchTerm !== undefined && currentSearchTerm !== '') {
          return isReceiverMatchingSearchTerm(item.receiver, currentSearchTerm);
        }
        return true;
      })
      .map((itemStore) =>
        derive([itemStore], ([{currentValue: currentItem}]) => {
          // Typescript cannot infer that we filtered out all non-contacts just above.
          assert(currentItem.receiver.type === 'contact');
          return {
            ...currentItem,
            interaction: {
              mode: 'select',
              isSelected: currentSelectedMembers.has(currentItem.receiver.lookup.uid),
              onselect: (selected) => {
                if (currentItem.receiver.type !== 'contact') {
                  log.debug('EditGroupMembers receiver list should only contain contacts');
                  return;
                }
                const uid = currentItem.receiver.lookup.uid;

                if (selected) {
                  addedMembers.add(uid);
                  removedMembers.delete(uid);
                } else {
                  addedMembers.delete(uid);
                  removedMembers.add(uid);
                }

                selectedMembers = difference(
                  new Set([...currentGroupMembers, ...addedMembers]),
                  removedMembers,
                );
              },
            },
          } satisfies ReceiverPreviewListItem<unknown>;
        }),
      );
  }

  const currentGroupMembers = $derived(
    new Set(
      $viewModelStore?.groupReceiverData.members.flatMap((member) => {
        // This typecheck is necessary for us to extract the uid below. It should, however, never
        // happen in practice.
        if (member.type === 'self') {
          return [];
        }
        return member.lookup.uid;
      }),
    ),
  );

  $effect(() => reactive(handleChangeRouterState, [$router]));
  $effect(() => {
    reactive(handleChangeRouteParams, [routeParams]).catch(assertUnreachable);
  });

  let selectedMembers = $derived(reactive(diffCurrentMembers, [$viewModelStore]));

  const receiverPreviewListProps = $derived(
    groupEditViewModelStoreToContactList(viewModelStore, $appearance),
  );

  const filteredReceiverList = $derived(
    filterCurrentMembers($receiverPreviewListProps, searchTerm, selectedMembers),
  );
</script>

{#if filteredReceiverList !== undefined}
  <Modal
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
          label: $i18n.t('dialog--common.action--save', 'Save'),
          onclick: 'submit',
          type: 'filled',
          state: submitButtonLoading ? 'loading' : 'default',
        },
      ],
      title: $i18n.t('dialog--edit-group-members.label--title', 'Edit Group Members'),
      maxWidth: 520,
    }}
    onsubmit={setGroupMembers}
    onclose={closeModal}
  >
    <div class="search">
      <SearchBar
        bind:term={searchTerm}
        placeholder={$i18n.t('contacts.label--search-private-contacts', 'Search Contacts')}
        onclear={() => {}}
      />
    </div>
    <div class="content">
      <div class="list">
        <ReceiverPreviewList highlights={searchTerm} items={filteredReceiverList} {services} />
      </div>
    </div>
  </Modal>
{/if}

<style lang="scss">
  @use 'component' as *;
  .search {
    padding: 0 rem(16px) rem(12px);
  }

  .content {
    grid-area: content;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: start;
    gap: rem(8px);
    height: rem(460px);

    .list {
      grid-area: list;
      overflow-y: auto;
    }
  }
</style>
