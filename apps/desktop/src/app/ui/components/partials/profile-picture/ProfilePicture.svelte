<!--
  @component Renders a receiver's profile picture. Note: This basically only reuses the `Avatar`
  component, but includes some additional convenience features, such as loading the profile picture.
-->
<script lang="ts">
  import {globals} from '~/app/globals';
  import Avatar from '~/app/ui/components/atoms/avatar/Avatar.svelte';
  import type {AvatarCharm} from '~/app/ui/components/atoms/avatar/props';
  import type {ProfilePictureProps} from '~/app/ui/components/partials/profile-picture/props';
  import {i18n} from '~/app/ui/i18n';
  import {mapToLabel} from '~/app/ui/utils/availability-status';
  import {reactive} from '~/app/ui/utils/svelte';
  import type {DbReceiverLookup} from '~/common/db';
  import type {ProfilePictureBlobStoreValue} from '~/common/dom/ui/profile-picture';
  import {WorkAvailabilityStatusCategory} from '~/common/enum';
  import type {u53} from '~/common/types';
  import {unreachable} from '~/common/utils/assert';
  import {mapToColor, mapToIcon} from '~/common/utils/availability-status';
  import {type IQueryableStore, ReadableStore} from '~/common/utils/store';
  import type {ContactReceiverData} from '~/common/viewmodel/utils/receiver';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.profile-picture');

  const {
    extraCharms = [],
    onclick,
    options = {},
    receiver,
    services,
    size = 'md',
    snippetOverlay,
    unreadMessageCount = 0,
  }: ProfilePictureProps = $props();

  const {isClickable = false, isFocusable = false} = $derived(options);

  let profilePictureStore = $state<IQueryableStore<ProfilePictureBlobStoreValue>>(
    new ReadableStore(undefined),
  );

  function updateProfilePictureStore(lookup: DbReceiverLookup | 'self'): void {
    if (lookup === 'self') {
      profilePictureStore = services.profilePicture.getProfilePictureForSelf();
      return;
    }

    services.profilePicture
      .getProfilePictureForReceiver(lookup)
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

  function getAvatarSizePxForSize(currentSize: typeof size): u53 {
    switch (currentSize) {
      case 'lg':
        return 120;

      case 'md':
        return 48;

      case 'sm':
        return 40;

      case 'xs':
        return 24;

      default:
        return unreachable(currentSize);
    }
  }

  function getAvatarCharms(
    currentReceiver: Pick<ContactReceiverData, 'badge' | 'workAvailabilityStatus'>,
    hideDefaultCharms: boolean | undefined,
  ): AvatarCharm[] {
    if (hideDefaultCharms === true) {
      return [];
    }

    let receiverCharm: AvatarCharm[];
    switch (currentReceiver.badge) {
      case 'contact-consumer':
        receiverCharm = [
          {
            content: {
              type: 'icon',
              description: $i18n.t(
                'contacts.hint--badge-consumer',
                'This contact uses {shortAppName}’s consumer version.',
                {shortAppName: import.meta.env.SHORT_APP_NAME},
              ),
              icon: 'threema_consumer_contact',
            },
            position: 225,
            style: {
              type: 'cutout',
              backgroundColor: 'transparent',
              contentColor: 'var(--cc-profile-picture-overlay-badge-icon-consumer-color)',
              fontSize: 14,
              gap: 1,
            },
          },
        ];
        break;

      case 'contact-work':
        receiverCharm = [
          {
            content: {
              type: 'icon',
              description: $i18n.t(
                'contacts.hint--badge-work',
                'This contact uses the business app {fullAppName}.',
                {
                  fullAppName: import.meta.env.APP_NAME,
                },
              ),
              icon: 'threema_work_contact',
            },
            position: 225,
            style: {
              type: 'cutout',
              backgroundColor: 'transparent',
              contentColor: 'var(--cc-profile-picture-overlay-badge-icon-work-color)',
              fontSize: 14,
              gap: 1,
            },
          },
        ];
        break;

      case undefined:
        // No charm, as the contact doesn't have a badge.
        receiverCharm = [];
        break;

      default:
        return unreachable(currentReceiver.badge);
    }

    const unreadMessageCountCharm: AvatarCharm[] =
      unreadMessageCount <= 0
        ? []
        : [
            {
              content: {
                type: 'text',
                text: `${unreadMessageCount > 9 ? '9+' : unreadMessageCount}`,
              },
              offset: {
                x: 0,
                y: -1,
              },
              position: 45,
              style: {
                type: 'cutout',
                backgroundColor: 'var(--cc-profile-picture-overlay-unread-background-color)',
                contentColor: 'var(--cc-profile-picture-overlay-unread-text-color)',
                gap: 2,
              },
            },
          ];

    let availabilityStatusCharm: AvatarCharm[] = [];
    if (
      currentReceiver.workAvailabilityStatus !== undefined &&
      // TODO(DESK-2160): Enable for all Work variants.
      import.meta.env.BUILD_FLAVOR === 'work-sandbox'
    ) {
      switch (currentReceiver.workAvailabilityStatus.category) {
        case WorkAvailabilityStatusCategory.BUSY:
        case WorkAvailabilityStatusCategory.UNAVAILABLE:
          availabilityStatusCharm = [
            {
              content: {
                type: 'icon',
                description: mapToLabel(
                  currentReceiver.workAvailabilityStatus.category,
                  undefined,
                  $i18n,
                ),
                icon: mapToIcon(currentReceiver.workAvailabilityStatus.category),
                family: 'material',
              },
              offset: {
                x: -1,
                y: -1,
              },
              position: 135,
              style: {
                type: 'cutout',
                backgroundColor: 'transparent',
                contentColor: mapToColor(currentReceiver.workAvailabilityStatus.category),
                fontSize: 18,
                gap: 1,
              },
            },
          ];
          break;

        case WorkAvailabilityStatusCategory.NONE:
          availabilityStatusCharm = [];
          break;

        default:
          return unreachable(currentReceiver.workAvailabilityStatus.category);
      }
    }

    return [...receiverCharm, ...unreadMessageCountCharm, ...availabilityStatusCharm];
  }

  /**
   * Updates only if the value of `receiver.lookup.type` or `receiver.lookup.uid` changes, not on
   * every change of the `receiver` object.
   */
  const currentReceiverLookup = $derived<string>(
    receiver.type === 'self' ? receiver.type : `${receiver.lookup.type}:${receiver.lookup.uid}`,
  );

  $effect(() => {
    reactive(
      () => updateProfilePictureStore(receiver.type === 'self' ? receiver.type : receiver.lookup),
      [currentReceiverLookup],
    );
  });
</script>

<Avatar
  byteStore={profilePictureStore}
  charms={[
    ...(receiver.type === 'self' ? [] : getAvatarCharms(receiver, options.hideDefaultCharms)),
    ...extraCharms,
  ]}
  color={receiver.color}
  description={$i18n.t('contacts.hint--profile-picture', {
    name: receiver.name,
  })}
  initials={receiver.initials}
  {isClickable}
  {isFocusable}
  {onclick}
  size={getAvatarSizePxForSize(size)}
  {snippetOverlay}
></Avatar>
