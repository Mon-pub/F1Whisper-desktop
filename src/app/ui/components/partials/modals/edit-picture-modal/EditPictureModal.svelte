<script lang="ts">
  import {onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import Avatar from '~/app/ui/components/atoms/avatar/Avatar.svelte';
  import FileInput from '~/app/ui/components/atoms/file-input/FileInput.svelte';
  import DropZoneProvider from '~/app/ui/components/hocs/drop-zone-provider/DropZoneProvider.svelte';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import type {EditPictureModalProps} from '~/app/ui/components/partials/modals/edit-picture-modal/props';
  import {i18n} from '~/app/ui/i18n';
  import {toast} from '~/app/ui/snackbar';
  import type {FileResult} from '~/app/ui/svelte-components/utils/filelist';
  import {
    PROFILE_PICTURE_DOWNSIZE_MAXSIZE,
    PROFILE_PICTURE_DOWNSIZE_QUALITY,
  } from '~/app/ui/utils/constants';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {ProfilePictureBlobStoreValue} from '~/common/dom/ui/profile-picture';
  import {cropToSquare, downsizeImage} from '~/common/dom/utils/image';
  import type {Dimensions} from '~/common/types';
  import {unreachable, unwrap} from '~/common/utils/assert';
  import {isSupportedImageType} from '~/common/utils/image';
  import {WritableStore} from '~/common/utils/store';

  const {uiLogging} = globals.unwrap();
  const log = uiLogging.logger('ui.component.edit-picture-modal');

  const {title, color, initials, displayName, blob, onclose, onsubmit}: EditPictureModalProps =
    $props();

  const profilePictureStore = $state<WritableStore<ProfilePictureBlobStoreValue>>(
    new WritableStore<ProfilePictureBlobStoreValue>(undefined),
  );

  let fileInput = $state<SvelteNullableBinding<HTMLInputElement>>(null);

  async function handleFileResult(fileResult: FileResult): Promise<void> {
    switch (fileResult.status) {
      case 'ok':
        break;
      case 'partial':
      case 'inaccessible':
      case 'empty':
        toast.addSimpleFailure(
          $i18n.t(
            'dialog--edit-profile-picture.error--loading-file-failed',
            'Failed to load the provided file',
          ),
        );
        return;
      default:
        unreachable(fileResult);
    }
    if (fileResult.files.length === 0) {
      return;
    }
    if (fileResult.files.length > 1) {
      log.debug(
        'Multiple profile picture candidates were passed to the modal. Taking the first one',
      );
    }
    const file = unwrap(fileResult.files[0]);

    // Check if file is a supported image
    if (!isSupportedImageType(file.type)) {
      toast.addSimpleFailure(
        $i18n.t(
          'dialog--edit-profile-picture.error--file-wrong-format',
          'Provided file has the wrong format',
        ),
      );
      return;
    }

    // TODO(DESK-1973): This is just temporary. Remove it once the profile picture editor is
    // implemented.
    const croppedBlob = await cropToSquare(file);
    if (croppedBlob === undefined) {
      toast.addSimpleFailure(
        $i18n.t(
          'dialog--edit-profile-picture.error--loading-file-failed',
          'Failed to load the provided file',
        ),
      );
      return;
    }

    const img = await downsizeImage(
      croppedBlob,
      'image/jpeg',
      PROFILE_PICTURE_DOWNSIZE_MAXSIZE,
      PROFILE_PICTURE_DOWNSIZE_QUALITY,
    );

    if (img !== undefined) {
      await setProfilePictureStore(img.resized, img.resizedDimensions);
    } else {
      toast.addSimpleFailure(
        $i18n.t(
          'dialog--edit-profile-picture.error--loading-file-failed',
          'Failed to load the provided file',
        ),
      );
    }
  }

  async function setProfilePictureStore(
    img: Blob | undefined,
    dimensions?: Dimensions,
  ): Promise<void> {
    if (img === undefined) {
      profilePictureStore.set(undefined);
      return;
    }

    if (dimensions !== undefined) {
      profilePictureStore.set({
        blob: img,
        dimensions,
      });
      return;
    }

    const bitmap = await createImageBitmap(img);
    profilePictureStore.set({
      blob: img,
      dimensions: {height: bitmap.height, width: bitmap.width},
    });
    bitmap.close();
  }

  const isSet = $derived($profilePictureStore?.blob !== undefined);
  const isDirty = $derived($profilePictureStore?.blob !== blob);

  onMount(async () => {
    await setProfilePictureStore(blob);
  });
</script>

<Modal
  wrapper={{
    type: 'card',
    actions: [
      {
        iconName: 'close',
        onclick: onclose,
      },
    ],
    buttons: [
      {
        label: $i18n.t('dialog--edit-profile-picture.action--delete', 'Remove Photo'),
        onclick: async () => {
          await setProfilePictureStore(undefined);
        },
        type: 'naked',
        disabled: !isSet,
      },
      {
        label: $i18n.t('dialog--edit-profile-picture.action--upload', 'Upload Photo'),
        onclick: () => {
          fileInput?.click();
        },
        type: 'naked',
        disabled: false,
      },
      {
        label: $i18n.t('dialog--edit-profile-picture.action--save', 'Save Changes'),
        onclick: 'submit',
        type: 'filled',
        disabled: !isDirty,
      },
    ],
    title,

    maxWidth: 640,
  }}
  {onclose}
  onsubmit={() => {
    onsubmit(profilePictureStore.get()?.blob);
  }}
  options={{
    allowClosingWithEsc: true,
    allowSubmittingWithEnter: false,
  }}
>
  <div class="content">
    <DropZoneProvider
      overlay={{
        message: $i18n.t('dialog--edit-profile-picture.hint--drop-file', 'Drop file here'),
      }}
      ondropfiles={handleFileResult}
    >
      <Avatar
        byteStore={profilePictureStore}
        {color}
        description={$i18n.t('contacts.hint--profile-picture', {
          name: displayName,
        })}
        {initials}
        size={PROFILE_PICTURE_DOWNSIZE_MAXSIZE}
      ></Avatar>
    </DropZoneProvider>

    <FileInput accept="image/*" ondropfiles={handleFileResult} bind:fileInput />
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    justify-content: center;
  }
</style>
