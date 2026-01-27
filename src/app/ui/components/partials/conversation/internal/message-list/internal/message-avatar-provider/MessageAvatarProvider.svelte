<!--
  @component Renders an avatar picture next to the message passed as the child.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import {ROUTE_DEFINITIONS} from '~/app/routing/routes';
  import Avatar from '~/app/ui/components/atoms/avatar/Avatar.svelte';
  import type {MessageAvatarProviderProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-avatar-provider/props';
  import {i18n} from '~/app/ui/i18n';
  import type {ProfilePictureBlobStoreValue} from '~/common/dom/ui/profile-picture';
  import {ReceiverType} from '~/common/enum';
  import {ensureError} from '~/common/utils/assert';
  import {type IQueryableStore, ReadableStore} from '~/common/utils/store';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.message-avatar-provider');

  const {conversation, direction, sender, services, children}: MessageAvatarProviderProps =
    $props();
  const {router, backend} = services;

  let profilePictureStore = $state<IQueryableStore<ProfilePictureBlobStoreValue>>(
    new ReadableStore(undefined),
  );

  async function handleClickAvatar(): Promise<void> {
    if (sender.type === 'self') {
      log.error('Sender type is self of clicked avatar');
      return;
    }

    const route = router.get();

    // Set acquaintance level to direct before navigation to a clicked avatar in a group chat.
    if (conversation.receiver.type === 'group' && direction === 'inbound') {
      try {
        await backend.viewModel
          .groupDetail(conversation.receiver.lookup)
          .then(async (viewModelBundle) => {
            if (viewModelBundle === undefined) {
              throw new Error('ViewModelBundle returned by the repository was undefined');
            }

            return await viewModelBundle.viewModelController.setAcquaintanceLevelDirect({
              type: ReceiverType.CONTACT,
              uid: sender.uid,
            });
          });
      } catch (error) {
        log.error(`Failed to set acquaintance level: ${ensureError(error)}`);
        // Prevent navigation.
        return;
      }
    }

    if (route.aside !== undefined) {
      router.go({
        main: ROUTE_DEFINITIONS.main.conversation.withParams({
          receiverLookup: {
            type: ReceiverType.CONTACT,
            uid: sender.uid,
          },
        }),
        aside: ROUTE_DEFINITIONS.aside.contactDetails.withParams({
          type: ReceiverType.CONTACT,
          uid: sender.uid,
        }),
      });
    } else {
      router.go({
        main: ROUTE_DEFINITIONS.main.conversation.withParams({
          receiverLookup: {
            type: ReceiverType.CONTACT,
            uid: sender.uid,
          },
        }),
      });
    }
  }

  function updateProfilePictureStore(
    conversationValue: typeof conversation,
    senderValue: typeof sender,
    directionValue: typeof direction,
  ): void {
    if (
      conversationValue.receiver.type === 'group' &&
      directionValue === 'inbound' &&
      senderValue.type !== 'self'
    ) {
      services.profilePicture
        .getProfilePictureForReceiver({
          type: ReceiverType.CONTACT,
          uid: senderValue.uid,
        })
        .then((store) => {
          if (store === undefined) {
            profilePictureStore = new ReadableStore(undefined);
          } else {
            profilePictureStore = store;
          }
        })
        .catch((error: unknown) => {
          log.warn(`Failed to fetch profile picture store: ${error}`);
          profilePictureStore = new ReadableStore(undefined);
        });
    }
  }

  $effect(() => {
    updateProfilePictureStore(conversation, sender, direction);
  });
</script>

{#if conversation.receiver.type === 'group' && direction === 'inbound'}
  <span class="avatar">
    <Avatar
      byteStore={profilePictureStore}
      color={sender.color}
      description={$i18n.t('contacts.hint--profile-picture', {
        name: sender.name,
      })}
      initials={sender.initials}
      onclick={handleClickAvatar}
      size={24}
    />
  </span>
{/if}

{@render children?.()}

<style lang="scss">
  @use 'component' as *;

  .avatar {
    // If this avatar is part of a flex container, prevent it from being resized.
    flex: none;
  }
</style>
