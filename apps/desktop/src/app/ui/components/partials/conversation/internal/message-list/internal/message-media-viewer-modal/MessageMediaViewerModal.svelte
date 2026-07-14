<!--
  @component Renders a modal to preview media contained in a message.
-->
<script lang="ts">
  import {onDestroy} from 'svelte';

  import {globals} from '~/app/globals';
  import Modal from '~/app/ui/components/hocs/modal/Modal.svelte';
  import ImagePreview from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/internal/image-preview/ImagePreview.svelte';
  import VideoPreview from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/internal/video-preview/VideoPreview.svelte';
  import type {MessageMediaViewerModalProps} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/props';
  import type {MediaState} from '~/app/ui/components/partials/conversation/internal/message-list/internal/message-media-viewer-modal/types';
  import Popover from '~/app/ui/generic/popover/Popover.svelte';
  import type {VirtualRect} from '~/app/ui/generic/popover/types';
  import {i18n} from '~/app/ui/i18n';
  import type {I18nType} from '~/app/ui/i18n-types';
  import {toast} from '~/app/ui/snackbar';
  import CircularProgress from '~/app/ui/svelte-components/blocks/CircularProgress/CircularProgress.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import MenuContainer from '~/app/ui/svelte-components/generic/Menu/MenuContainer.svelte';
  import MenuItem from '~/app/ui/svelte-components/generic/Menu/MenuItem.svelte';
  import {handleCopyImage, handleSaveAsFile} from '~/app/ui/utils/file-sync/handlers';
  import {syncAndGetPayload} from '~/app/ui/utils/file-sync/helpers';
  import {nodeIsOrContainsTarget} from '~/app/ui/utils/node';
  import {svelteUnreachable, type SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {assertUnreachable, unreachable} from '~/common/utils/assert';
  import {isSupportedImageType} from '~/common/utils/image';

  const log = globals.unwrap().uiLogging.logger('ui.component.message-media-viewer-modal');

  const {file, onclose}: MessageMediaViewerModalProps = $props();

  let mediaState = $state<MediaState>({status: 'loading'});

  let modalComponent = $state<SvelteNullableBinding<Modal>>(null);
  let popoverComponent = $state<SvelteNullableBinding<Popover>>(null);

  let actionsElement = $state<SvelteNullableBinding<HTMLElement>>(null);
  let modalElement = $state<SvelteNullableBinding<HTMLElement>>(null);
  let popoverElement = $state<SvelteNullableBinding<HTMLElement>>(null);
  let previewElement = $state<SvelteNullableBinding<HTMLElement>>(null);

  let popoverCoordinates = $state<VirtualRect | undefined>(undefined);
  let isPopoverOpen = $state<boolean>(false);

  // Whether the previewed video is currently being displayed in element picture-in-picture. Drives
  // the placeholder shown in place of the (hidden) source video. See `handleEnterPip`.
  let isPictureInPictureActive = $state<boolean>(false);

  function handleEnterPip(): void {
    isPictureInPictureActive = true;
  }

  function handleLeavePip(): void {
    isPictureInPictureActive = false;
  }

  function handleClickCopyImage(): void {
    handleCopyImage(file, log, $i18n.t, toast.addSimpleSuccess, toast.addSimpleFailure).catch(
      assertUnreachable,
    );
  }

  function handleClickSave(): void {
    handleSaveAsFile(file, log, $i18n.t, toast.addSimpleFailure).catch(assertUnreachable);
  }

  function handleWillClosePopover(): void {
    isPopoverOpen = false;
  }

  function handleContextMenu(event: MouseEvent): void {
    popoverCoordinates = {
      width: 0,
      height: 0,
      left: event.clientX,
      right: 0,
      top: event.clientY,
      bottom: 0,
    };

    isPopoverOpen = true;
  }

  function handleClickModal(event: MouseEvent): void {
    // Only close modal on backdrop clicks.
    if (
      !nodeIsOrContainsTarget(previewElement, event.target) &&
      !nodeIsOrContainsTarget(actionsElement, event.target) &&
      !nodeIsOrContainsTarget(popoverElement, event.target)
    ) {
      if (isPopoverOpen) {
        popoverComponent?.close();
        isPopoverOpen = false;
      } else {
        modalComponent?.close();
      }
    }
  }

  // Whether the loaded media is a video for which the browser supports picture-in-picture.
  const isPictureInPictureAvailable = $derived(
    mediaState.status === 'loaded' &&
      mediaState.type === 'video' &&
      document.pictureInPictureEnabled,
  );

  function getPreviewVideoElement(): HTMLVideoElement | undefined {
    return previewElement instanceof HTMLVideoElement ? previewElement : undefined;
  }

  /**
   * Toggle picture-in-picture for the previewed video. Mirrors the proven PiP handling in
   * `ParticipantFeed.svelte`: feature-detect, toggle if already active, and wait for metadata when
   * the video has not loaded its dimensions yet.
   */
  function handleTogglePictureInPicture(): void {
    const videoElement = getPreviewVideoElement();
    if (videoElement === null || videoElement === undefined || !document.pictureInPictureEnabled) {
      return;
    }

    if (document.pictureInPictureElement === videoElement) {
      document.exitPictureInPicture().catch((error: unknown) => {
        log.warn('Exiting picture-in-picture failed', error);
      });
      return;
    }

    const enter = (): void => {
      videoElement.requestPictureInPicture().catch((error: unknown) => {
        log.warn('Entering picture-in-picture failed', error);
      });
    };

    if (Number.isNaN(videoElement.duration)) {
      videoElement.addEventListener('loadedmetadata', enter, {once: true});
    } else {
      enter();
    }
  }

  function revokeLoadedMediaUrl(): void {
    if (mediaState.status === 'loaded') {
      URL.revokeObjectURL(mediaState.url);
    }
  }

  function updateMediaState(currentFile: typeof file, t: I18nType['t']): void {
    // `syncAndGetPayload` doesn't need to be caught, as it will never reject and simply return a
    // `SyncFailure` result instead.
    syncAndGetPayload(currentFile.fetchFileBytes, t)
      .then((result) => {
        revokeLoadedMediaUrl();

        switch (result.status) {
          case 'ok':
            if (currentFile.type === 'image' && !isSupportedImageType(result.data.mediaType)) {
              mediaState = {
                status: 'failed',
                localizedReason: $i18n.t(
                  'messaging.error--file-preview-unsupported-error',
                  'This file cannot be previewed.',
                ),
              };
            } else {
              mediaState = {
                status: 'loaded',
                type: currentFile.type,
                url: URL.createObjectURL(
                  new Blob([result.data.bytes], {type: result.data.mediaType}),
                ),
              };
            }
            break;

          case 'error':
            mediaState = {
              status: 'failed',
              localizedReason: result.message,
            };
            break;

          default:
            unreachable(result);
        }
      })
      .catch(assertUnreachable);
  }

  function updatePopoverState(coordinates: VirtualRect | undefined, isOpen: boolean): void {
    if (isOpen && coordinates !== undefined) {
      popoverComponent?.open();
    }
  }

  $effect(() => {
    updateMediaState(file, $i18n.t);
  });

  $effect(() => {
    updatePopoverState(popoverCoordinates, isPopoverOpen);
  });

  // Track element picture-in-picture transitions on the bound video element so the modal can hide
  // the dimmed source video (via CSS in `VideoPreview.svelte`) and show a clean placeholder. Re-runs
  // whenever the bound preview element changes; cleans up its listeners on teardown.
  $effect(() => {
    const videoElement = getPreviewVideoElement();
    if (videoElement === undefined) {
      isPictureInPictureActive = false;
      return undefined;
    }

    // Reflect the current state in case PiP was already active when this effect (re-)ran.
    isPictureInPictureActive = document.pictureInPictureElement === videoElement;

    videoElement.addEventListener('enterpictureinpicture', handleEnterPip);
    videoElement.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      videoElement.removeEventListener('enterpictureinpicture', handleEnterPip);
      videoElement.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  });

  onDestroy(() => {
    // Leave picture-in-picture if this modal owned the PiP window, so closing the viewer doesn't
    // strand a detached PiP window pointing at a revoked object URL.
    const videoElement = getPreviewVideoElement();
    if (videoElement !== undefined) {
      videoElement.removeEventListener('enterpictureinpicture', handleEnterPip);
      videoElement.removeEventListener('leavepictureinpicture', handleLeavePip);
    }
    if (
      document.pictureInPictureElement !== null &&
      document.pictureInPictureElement === videoElement
    ) {
      document.exitPictureInPicture().catch(() => {
        // Best-effort; nothing actionable if exiting fails during teardown.
      });
    }
    revokeLoadedMediaUrl();
  });
</script>

<Modal
  bind:this={modalComponent}
  bind:actionsElement
  bind:element={modalElement}
  onclick={handleClickModal}
  {onclose}
  wrapper={{
    type: 'none',
    actions: [
      ...(isPictureInPictureAvailable
        ? [
            {
              iconName: 'picture_in_picture_alt',
              onclick: handleTogglePictureInPicture,
            },
          ]
        : []),
      {
        iconName: 'download',
        onclick: handleClickSave,
      },
      {
        iconName: 'close',
        onclick: 'close',
      },
    ],
  }}
>
  <div class="content">
    {#if mediaState.status === 'loading'}
      <div class="progress">
        <CircularProgress variant="indeterminate" />
      </div>
    {:else if mediaState.status === 'loaded'}
      {#if mediaState.type === 'image'}
        <div class="preview">
          <ImagePreview
            bind:element={previewElement}
            image={mediaState}
            oncontextmenu={handleContextMenu}
          />
        </div>
      {:else if mediaState.type === 'video'}
        <div class="preview">
          <VideoPreview
            bind:element={previewElement}
            video={mediaState}
            oncontextmenu={handleContextMenu}
          />
          {#if isPictureInPictureActive}
            <div class="pip-placeholder">
              <MdIcon theme="Filled">picture_in_picture_alt</MdIcon>
              <span>
                {$i18n.t(
                  'dialog--media-message-viewer.label--playing-in-pip',
                  'Playing in picture-in-picture',
                )}
              </span>
            </div>
          {/if}
        </div>
      {:else}
        {svelteUnreachable(mediaState)}
      {/if}

      <Popover
        bind:this={popoverComponent}
        bind:element={popoverElement}
        anchorPoints={{
          reference: {
            horizontal: 'left',
            vertical: 'bottom',
          },
          popover: {
            horizontal: 'left',
            vertical: 'top',
          },
        }}
        container={modalElement}
        offset={{left: 4, top: 4}}
        onbeforeclose={handleWillClosePopover}
        reference={popoverCoordinates}
        triggerBehavior="open"
      >
        {#snippet snippetPopover()}
          <div class="context-menu">
            <MenuContainer mode="small">
              <MenuItem onclick={handleClickSave}>
                {#snippet snippetIcon()}
                  <span class="icon">
                    <MdIcon theme="Outlined">download</MdIcon>
                  </span>
                {/snippet}
                <span>
                  {$i18n.t('messaging.action--message-option-save-as-file', 'Save as File')}
                </span>
              </MenuItem>
              {#if file.type === 'image'}
                <MenuItem onclick={handleClickCopyImage}>
                  {#snippet snippetIcon()}
                    <span class="icon">
                      <MdIcon theme="Outlined">photo_library</MdIcon>
                    </span>
                  {/snippet}
                  <span>
                    {$i18n.t('messaging.action--message-option-copy-image', 'Copy Image')}
                  </span>
                </MenuItem>
              {/if}
            </MenuContainer>
          </div>
        {/snippet}
      </Popover>
    {:else if mediaState.status === 'failed'}
      <p class="error">
        <MdIcon theme="Filled">error</MdIcon>
        {#if mediaState.localizedReason !== undefined}
          {mediaState.localizedReason}
        {:else}
          {$i18n.t(
            'dialog--media-message-viewer.error--media-not-loaded',
            'Media could not be loaded.',
          )}
        {/if}
      </p>
    {:else}
      {svelteUnreachable(mediaState)}
    {/if}
  </div>
</Modal>

<style lang="scss">
  @use 'component' as *;

  .content {
    display: flex;
    place-items: center;

    .preview {
      display: grid;
      position: relative;
      place-items: center;
      width: 100vw;
      height: 100vh;
      padding: rem(41px);

      // Opaque cover painted over the source video while element picture-in-picture is active. The
      // source <video> keeps rendering normally (so the floating PiP window stays bright), but
      // Chromium paints an in-app dim + a "Back to tab" overlay on the source video box; a solid
      // surface-colored card stacked above it (same grid cell, `z-index` above the video) hides both
      // and shows a clean label instead.
      .pip-placeholder {
        grid-area: 1 / 1;
        z-index: 1;
        display: flex;
        gap: rem(8px);
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        border-radius: rem(8px);
        background-color: var(--t-main-background-color);
        color: var(--t-text-e1-color);

        // Purely decorative: let clicks fall through to the backdrop so the placeholder never
        // becomes an unexpected interactive target.
        pointer-events: none;
      }
    }

    .progress {
      width: rem(32px);
      height: rem(32px);
    }

    .error {
      display: flex;
      gap: rem(8px);
      align-items: center;
      padding: rem(24px);
      font-size: medium;
    }
  }

  .context-menu {
    --c-menu-container-min-width: #{rem(180px)};
    @extend %elevation-060;

    border-radius: rem(8px);
  }
</style>
