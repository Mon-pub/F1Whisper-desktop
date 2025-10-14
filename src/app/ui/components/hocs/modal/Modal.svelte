<!--
  @component Renders the given content in a full-screen modal overlay. Note: Uses a `Portal` to be
  rendered outside of its current tree as a child of the main `#container`.
-->
<script lang="ts">
  import {onDestroy, onMount} from 'svelte';

  import {globals} from '~/app/globals';
  import type {ModalProps} from '~/app/ui/components/hocs/modal/props';
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import IconButton from '~/app/ui/svelte-components/blocks/Button/IconButton.svelte';
  import MdIcon from '~/app/ui/svelte-components/blocks/Icon/MdIcon.svelte';
  import type {u53} from '~/common/types';
  import {unreachable} from '~/common/utils/assert';

  const hotkeyManager = globals.unwrap().hotkeyManager;

  let {
    actionsElement = $bindable(undefined),
    children,
    element = $bindable(undefined),
    onclick,
    onclose,
    onopen,
    onsubmit,
    options = {},
    wrapper,
  }: ModalProps = $props();

  let closed = $state(false);

  /**
   * In a `<dialog>`, exactly one element must always be focused. By default, just pick the first
   * button, if:
   *
   * - None of the given buttons has `isFocused` explicitly set to `true`, or
   * - `allowSubmittingWithEnter` is not set to `true`.
   */
  let initiallyFocusedButtonIndex = $state(0);

  /**
   * Close the modal.
   */
  export function close(): void {
    closeModal(element);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();

      if (options.allowClosingWithEsc ?? true) {
        closeModal(element, event);
      }
    }
  }

  function handleClose(event: Event): void {
    closed = true;
    onclose?.(event);
  }

  function handleClickClose(event: MouseEvent): void {
    closeModal(element, event);
  }

  function handleClickSubmit(event: MouseEvent): void {
    onsubmit?.(event);
  }

  function handleChangeClosedState(isClosed: boolean): void {
    if (!(options.suspendHotkeysWhenVisible ?? true)) {
      return;
    }

    if (isClosed) {
      hotkeyManager.resume();
      window.removeEventListener('keydown', handleKeydown);
    } else {
      hotkeyManager.suspend();
      window.addEventListener('keydown', handleKeydown);
    }
  }

  /**
   * Set the initially focused button. Note: Use only once when the modal is mounted for the first
   * time to prevent unexpected focus changes for users.
   */
  function setInitialButtonFocus(): void {
    // If the wrapper is not of type "card" there are no buttons to focus.
    if (!(wrapper.type === 'card')) {
      return;
    }

    let firstSubmitButtonIndex: u53 | undefined = undefined;
    for (const [index, button] of (wrapper.buttons ?? []).entries()) {
      // If the button is explicitly focused, which takes precedence over all other focus methods,
      // update the index and return early.
      if (button.isFocused === true) {
        initiallyFocusedButtonIndex = index;
        return;
      }

      // If the button is used as a submit button, remember its index to use it as a fallback in
      // case no other explicitly focused button is found.
      if (firstSubmitButtonIndex === undefined && button.onclick === 'submit') {
        firstSubmitButtonIndex = index;
      }
    }

    // No button has been focused explicitly, so we focus the "submit" button (if any exists and
    // `allowSubmittingWithEnter` is `true`), or otherwise reset the index of the focused button to
    // the first one (which is the default).
    initiallyFocusedButtonIndex = firstSubmitButtonIndex ?? 0;
  }

  function openModal(dialog: typeof element, event?: Event): void {
    if (dialog instanceof HTMLDialogElement) {
      if (!dialog.open) {
        dialog.showModal();
        closed = false;
        handleChangeClosedState(closed);
        onopen?.(event);
      }
    }
  }

  function closeModal(dialog: typeof element, event?: Event): void {
    if (dialog instanceof HTMLDialogElement) {
      if (dialog.open) {
        dialog.close();
        closed = true;
        handleChangeClosedState(closed);
        onclose?.(event);
      }
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    openModal(element);
    setInitialButtonFocus();
  });

  onDestroy(() => {
    closeModal(element);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if !closed}
  <dialog
    bind:this={element}
    class="modal"
    data-appearance={options.overlay ?? 'translucent'}
    onclose={handleClose}
  >
    <!-- A11y is already covered by the "close" action button. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class={`wrapper type-${wrapper.type}`} class:padded={wrapper.type === 'card'} {onclick}>
      {#if wrapper.type === 'none'}
        {@const {actions = []} = wrapper}

        {#if actions.length > 0}
          <div bind:this={actionsElement} class="actions">
            <!-- Key not required because all values are derived from `actions`. -->
            <!-- eslint-disable-next-line svelte/require-each-key -->
            {#each actions as action}
              <IconButton
                flavor="naked"
                onclick={action.onclick === 'close' ? handleClickClose : action.onclick}
              >
                <MdIcon theme="Outlined">{action.iconName}</MdIcon>
              </IconButton>
            {/each}
          </div>
        {/if}

        {@render children?.()}
      {:else if wrapper.type === 'card'}
        {@const {
          actions = [],
          buttons = [],
          elevated = true,
          minWidth = 320,
          maxWidth,
          title,
          layout = 'expansive',
        } = wrapper}

        <div
          class="card"
          class:elevated
          style:--c-t-min-width={`${minWidth}px`}
          style:--c-t-max-width={maxWidth === undefined ? '100%' : `${maxWidth}px`}
          style:--c-t-width={layout === 'expansive' ? '100%' : 'fit-content'}
        >
          {#if title !== undefined || actions.length > 0}
            <div class="header">
              {#if title !== undefined}
                <div class="title">{title}</div>
              {/if}

              {#if actions.length > 0}
                <div bind:this={actionsElement} class="actions">
                  <!-- Key not required because all values are derived from `actions`. -->
                  <!-- eslint-disable-next-line svelte/require-each-key -->
                  {#each actions as action}
                    <IconButton
                      flavor="naked"
                      onclick={action.onclick === 'close' ? handleClickClose : action.onclick}
                    >
                      <MdIcon theme="Outlined">{action.iconName}</MdIcon>
                    </IconButton>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <div class="content">
            {@render children?.()}
          </div>

          {#if buttons.length > 0}
            <div class="footer">
              <!-- Key not required because all values are derived from `buttons`. -->
              <!-- eslint-disable-next-line svelte/require-each-key -->
              {#each buttons as button, index}
                <Button
                  autofocus={initiallyFocusedButtonIndex === index}
                  disabled={button.disabled === true || button.state === 'loading'}
                  flavor={button.type}
                  isLoading={button.state === 'loading'}
                  onclick={(event) => {
                    if (button.onclick === 'close') {
                      handleClickClose(event);
                    } else if (button.onclick === 'submit') {
                      handleClickSubmit(event);
                    } else if (button.onclick !== undefined) {
                      button.onclick(event);
                    }
                  }}
                >
                  {button.label}
                </Button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        {unreachable(wrapper)}
      {/if}
    </div>
  </dialog>
{/if}

<style lang="scss">
  @use 'component' as *;

  $-vars: (min-width, max-width, width);
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  .modal {
    margin: 0;
    padding: 0;
    border: none;
    color: var(--t-text-e1-color);
    background: transparent;

    max-width: 100vw;
    width: 100vw;
    max-height: 100vh;
    height: 100vh;

    // Temporary properties to mimic a modal.
    position: absolute;
    z-index: $z-index-modal;
    top: 0;
    left: 0;
    background-color: var(--cc-modal-dialog-background-color);
    overflow: hidden;

    .wrapper {
      container-type: size;
      container-name: modal-wrapper;

      display: flex;
      align-items: center;
      justify-content: center;

      width: 100%;
      height: 100%;

      &.padded {
        padding: rem(20px);
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: right;
        gap: rem(8px);
        -webkit-app-region: no-drag;
      }

      &.type-none {
        .actions {
          position: absolute;
          display: flex;
          gap: rem(8px);
          z-index: calc($z-index-modal + $z-index-plus);
          top: rem(12px);
          right: rem(8px);

          &::before {
            content: '';
            z-index: $z-index-minus;
            pointer-events: none;
            display: block;
            position: absolute;
            width: calc(100% + rem(256px));
            height: calc(100% + rem(128px));
            top: rem(-12px);
            right: rem(-8px);
            background: radial-gradient(
              farthest-corner at top right,
              rgba(var(--cc-modal-dialog-background-color-rgb-triplet), 0.625) 0%,
              rgba(var(--cc-modal-dialog-background-color-rgb-triplet), 0.375) 18.75%,
              rgba(var(--cc-modal-dialog-background-color-rgb-triplet), 0.0625) 50%,
              rgba(var(--cc-modal-dialog-background-color-rgb-triplet), 0) 62.5%
            );
          }
        }
      }

      &.type-card {
        .card {
          display: grid;
          grid-template:
            'header' min-content
            'content' 1fr
            'footer' min-content /
            1fr;

          border: none;
          border-radius: rem(8px);

          min-width: var($-temp-vars, --c-t-min-width);
          max-width: min(var($-temp-vars, --c-t-max-width), 100%);
          width: var($-temp-vars, --c-t-width);

          min-height: auto;
          max-height: 100%;

          background-color: var(--c-modal-dialog-background-color);

          &.elevated {
            @extend %elevation-160;
          }

          .header {
            padding: rem(16px);
            display: flex;
            gap: rem(16px);
            align-items: center;
            justify-content: space-between;

            &:not(:has(.title)) {
              justify-content: end;
            }

            .title {
              @extend %font-large-400;
              text-overflow: ellipsis;
              overflow: hidden;
            }
          }

          .content {
            position: relative;
            flex: 1;
            min-width: 0;
            min-height: 0;
            max-width: 100%;
            max-height: 100%;
            overflow: auto;
          }

          .footer {
            display: flex;
            align-items: stretch;
            justify-content: end;
            gap: rem(8px);
            padding: rem(16px);
          }
        }
      }
    }

    &[data-appearance='opaque'] {
      background-color: rgb(var(--cc-modal-dialog-background-color-rgb-triplet));
    }
  }
</style>
