<!--
  @component Renders the group detail pane (i.e., details about a receiver).
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import GroupContent from '~/app/ui/components/partials/group-detail/internal/group-content/GroupContent.svelte';
  import TopBar from '~/app/ui/components/partials/group-detail/internal/top-bar/TopBar.svelte';
  import type {GroupDetailProps} from '~/app/ui/components/partials/group-detail/props';
  import type {
    GroupDetailRouteParams,
    ModalState,
    RemoteGroupDetailViewModelController,
    RemoteGroupDetailViewModelStoreValue,
  } from '~/app/ui/components/partials/group-detail/types';
  import EditGroupNameModal from '~/app/ui/components/partials/modals/edit-group-name-modal/EditGroupNameModal.svelte';
  import ProfilePictureModal from '~/app/ui/components/partials/modals/profile-picture-modal/ProfilePictureModal.svelte';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import {reactive} from '~/app/ui/utils/svelte';
  import type {DbGroupReceiverLookup, DbReceiverLookup} from '~/common/db';
  import {ReceiverType, ReceiverTypeUtils} from '~/common/enum';
  import {assertUnreachable, ensureError, unreachable} from '~/common/utils/assert';
  import {ReadableStore, type IQueryableStore} from '~/common/utils/store';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.group-detail');

  const {services}: GroupDetailProps = $props();

  const {backend, profilePicture, router} = services;

  // Params of the current route.
  let routeParams = $state<GroupDetailRouteParams | undefined>(undefined);

  // ViewModelBundle containing all the group details.
  let viewModelStore = $state<IQueryableStore<RemoteGroupDetailViewModelStoreValue | undefined>>(
    new ReadableStore(undefined),
  );
  let viewModelController = $state<RemoteGroupDetailViewModelController | undefined>(undefined);

  let modalState = $state<ModalState>({type: 'none'});

  function handleClickBack(): void {
    router.go({aside: 'close'});
  }

  function handleClickClose(): void {
    router.go({aside: 'close'});
  }

  function handleCloseModal(): void {
    modalState = {
      type: 'none',
    };
  }

  async function handleOpenProfilePictureModal(): Promise<void> {
    if ($viewModelStore === undefined) {
      log.error('Error opening profile picture modal because the view model store is not defined');
      return;
    }

    const {receiver} = $viewModelStore;
    const profilePictureBlobStore = await profilePicture
      .getProfilePictureForReceiver(receiver.lookup)
      .catch(() => {
        log.error(
          `Error opening profile picture modal: Profile picture for ${receiver.lookup.type}.${receiver.lookup.uid} could not be loaded`,
        );

        return undefined;
      });
    const profilePictureBlob = profilePictureBlobStore?.get();

    modalState = {
      type: 'profile-picture',
      props: {
        alt: $i18n.t('groups.hint--profile-picture', 'Profile picture of {name}', {
          name: receiver.name,
        }),
        color: receiver.color,
        initials: receiver.initials,
        pictureBytes:
          profilePictureBlob === undefined
            ? undefined
            : new Uint8Array(await profilePictureBlob.blob.arrayBuffer()),
      },
    };
  }

  function handleChangeRouterState(): void {
    const routerState = router.get();

    if (routerState.aside?.id === 'groupDetails') {
      routeParams = routerState.aside.params;
    } else {
      // If no detail is open, reset `routeParams` to `undefined` to clear the view.
      routeParams = undefined;
    }
  }

  async function handleChangeGroupDetail(): Promise<void> {
    // Because Svelte `$state` uses proxies under the hood, the current value needs to be unwrapped
    // to make it serializable for sending it to the backend.
    let unproxiedReceiver: DbGroupReceiverLookup | undefined = undefined;

    if (routeParams !== undefined) {
      unproxiedReceiver = $state.snapshot(routeParams) as unknown as DbGroupReceiverLookup;
    }

    const viewModelStoreValue = $viewModelStore;

    // If the receiver is the same, it's not necessary to reload the `viewModelBundle`.
    if (
      unproxiedReceiver !== undefined &&
      unproxiedReceiver.type === viewModelStoreValue?.receiver.lookup.type &&
      unproxiedReceiver.uid === viewModelStoreValue.receiver.lookup.uid
    ) {
      return;
    }

    // If the receiver is undefined, reset `viewModelStore` and -controller.
    if (unproxiedReceiver === undefined) {
      viewModelStore = new ReadableStore(undefined);
      viewModelController = undefined;
      return;
    }

    await backend.viewModel
      .groupDetail(unproxiedReceiver)
      .then((viewModelBundle) => {
        if (viewModelBundle === undefined) {
          throw new Error('ViewModelBundle returned by the repository was undefined');
        }
        viewModelStore = viewModelBundle.viewModelStore;
        viewModelController = viewModelBundle.viewModelController;
      })
      .catch((error: unknown) => {
        log.error(
          `Failed to load detail for group with uid ${unproxiedReceiver.uid}: ${ensureError(error)}`,
        );

        toast.addSimpleFailure(
          i18n.get().t('groups.error--group-detail-load', 'Details could not be loaded'),
        );

        // Close aside pane.
        router.go({aside: 'close'});
      });
  }

  function handleClickEditGroupName(): void {
    if ($viewModelStore === undefined) {
      log.error('Error opening group edit modal because the view model store is not defined');
      return;
    }

    const {receiver} = $viewModelStore;
    modalState = {
      type: 'edit-group-name',
      props: {
        receiver: {
          ...receiver,
          edit: async (update) => {
            if (viewModelController === undefined) {
              log.error('Error editing receiver: GroupDetailViewModelController was undefined');
              return false;
            }
            return await viewModelController.edit(update);
          },
        },
        services,
      },
    };
  }

  function handleClickEditGroupMembers(): void {
    if ($viewModelStore === undefined) {
      log.error(
        'Error opening group members edit modal because the view model store is not defined',
      );
      return;
    }

    if ($viewModelStore.receiver.creator.type !== 'self') {
      log.error('Error opening group members because the user is not the creator');
      return;
    }

    router.go({
      ...$router,
      modal: ROUTE_DEFINITIONS.modal.editGroupMembers.withParams({
        ...$viewModelStore.receiver.lookup,
      }),
    });
  }

  async function handleClickItem(item: {
    readonly lookup: DbReceiverLookup;
    readonly active: boolean;
  }): Promise<void> {
    if (item.lookup.type !== ReceiverType.CONTACT) {
      log.error(
        `Called the clickGroupMember callback with lookup of type ${ReceiverTypeUtils.nameOf(item.lookup.type)} instead of contact`,
      );
      return;
    }

    await viewModelController?.setAcquaintanceLevelDirect(item.lookup).catch((error) => {
      log.error(`Failed to set acquaintance level, routing to welcome: ${error}`);
      router.goToWelcome();
    });

    if (item.active) {
      router.goToWelcome();
    } else {
      router.goToConversation({receiverLookup: item.lookup});
    }
  }

  $effect(() => {
    reactive(handleChangeRouterState, [$router]);
  });

  $effect(() => {
    reactive(handleChangeGroupDetail, [routeParams]).catch(assertUnreachable);
  });
</script>

{#if $viewModelStore !== undefined && viewModelController !== undefined}
  <div class="container">
    <div class="top-bar">
      <TopBar onclickback={handleClickBack} onclickclose={handleClickClose} />
    </div>

    <div class="content">
      <GroupContent
        onclickeditmembers={handleClickEditGroupMembers}
        onclickeditname={handleClickEditGroupName}
        onclickitem={handleClickItem}
        onclickprofilepicture={handleOpenProfilePictureModal}
        receiver={$viewModelStore.receiver}
        {services}
      />
    </div>
  </div>
{/if}

{#if modalState.type === 'none'}
  <!-- No modal is displayed in this state. -->
{:else if modalState.type === 'profile-picture'}
  <ProfilePictureModal {...modalState.props} onclose={handleCloseModal} />
{:else if modalState.type === 'edit-group-name'}
  <EditGroupNameModal {...modalState.props} onclose={handleCloseModal} />
{:else}
  {unreachable(modalState)}
{/if}

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    overflow: hidden;

    grid-template:
      'top-bar' min-content
      'content' 1fr
      / 100%;

    .top-bar {
      grid-area: top-bar;
    }

    .content {
      grid-area: content;

      overflow-y: auto;
    }
  }
</style>
