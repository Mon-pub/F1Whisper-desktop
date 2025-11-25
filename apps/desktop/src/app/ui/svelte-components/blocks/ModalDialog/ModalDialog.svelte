<script lang="ts">
  import {onDestroy, type Snippet} from 'svelte';

  import GlobalOverlay from '~/app/ui/svelte-components/blocks/GlobalOverlay/GlobalOverlay.svelte';
  import type {Modal} from '~/app/ui/svelte-components/blocks/ModalDialog';

  interface Props {
    /**
     * Determine if the modal is cancelable via esc keydown event.
     */
    readonly closableWithEscape?: boolean;
    /**
     * Whether the modal should be styled as elevated.
     */
    readonly elevated?: boolean;
    readonly oncancel?: () => void;
    readonly onclickoutside?: () => void;
    readonly onclose?: () => void;
    readonly onconfirm?: () => void;
    /**
     * Determine if the modal is scrollable.
     */
    readonly scrollable?: boolean;
    readonly snippetBody?: Snippet<[modal: Modal]>;
    readonly snippetFooter?: Snippet<[modal: Modal]>;
    readonly snippetHeader?: Snippet<[modal: Modal]>;
    /**
     * Determine if the modal is visible.
     */
    readonly visible?: boolean;
  }

  let {
    closableWithEscape = true,
    elevated = true,
    oncancel,
    onclickoutside,
    onclose,
    onconfirm,
    scrollable = true,
    snippetBody,
    snippetFooter,
    snippetHeader,
    visible = $bindable(false),
  }: Props = $props();

  const modal: Modal = {
    clickoutside: (): void => {
      onclickoutside?.();
    },
    close: (): void => {
      onclose?.();
    },
    cancel: (): void => {
      oncancel?.();
    },
    confirm: (): void => {
      onconfirm?.();
    },
  };

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    if (closableWithEscape && event.key === 'Escape') {
      onclose?.();
    }
  }

  $effect(() => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown);
    } else {
      window.removeEventListener('keydown', handleKeydown);
    }
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if visible}
  <div class="modal-wrapper" data-build-platform={import.meta.env.BUILD_PLATFORM}>
    <GlobalOverlay onclickoverlay={modal.clickoutside}>
      <div class="modal" class:elevated>
        <div class="header">
          {@render snippetHeader?.(modal)}
        </div>
        <div class={scrollable ? 'scrollable' : ''}>
          {@render snippetBody?.(modal)}
        </div>
        <div class="footer">
          {@render snippetFooter?.(modal)}
        </div>
      </div>
    </GlobalOverlay>
  </div>
{/if}

<style lang="scss">
  @use 'component' as *;

  $defaultPadding: 20px;

  .modal-wrapper {
    display: grid;
    place-content: center;
    position: fixed;
    z-index: $z-index-modal;
    top: 0px;
    left: 0px;
    bottom: 0px;
    right: 0px;
    padding: var(--c-modal-dialog-padding, $defaultPadding);

    .modal {
      border-radius: rem(8px);
      background-color: var(--c-modal-dialog-background-color, default);
      display: grid;
      grid-template:
        'header' auto
        'body' 1fr
        'footer' auto
        / auto;
      max-height: calc(100vh - calc(2 * var(--c-modal-dialog-padding, $defaultPadding)));

      &.elevated {
        @extend %elevation-160;
      }

      .scrollable {
        overflow-y: auto;
      }
    }

    &[data-build-platform='macos'] {
      &::before {
        position: absolute;
        content: '';
        left: 0;
        right: 0;
        top: 0;
        height: rem(62px);

        // Electron custom style to make this element a window drag target.
        -webkit-app-region: drag;
      }
    }
  }
</style>
