<script lang="ts">
  import Button from '~/app/ui/svelte-components/blocks/Button/Button.svelte';
  import CircularProgress from '~/app/ui/svelte-components/blocks/CircularProgress/CircularProgress.svelte';
  import type {Modal} from '~/app/ui/svelte-components/blocks/ModalDialog';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {unreachable} from '~/common/utils/assert';

  interface ConfirmOnlyProps {
    readonly cancelText?: undefined;
    readonly confirmDisabled?: boolean;
    /**
     * Which button to focus on mount of the component, if any.
     */
    readonly focusOnMount?: 'confirm' | undefined;
  }

  interface CancelAndConfirmProps {
    readonly cancelDisabled?: boolean;
    /**
     * The text for the cancel button. If no text is defined, no cancel button will be shown.
     */
    readonly cancelText: string;
    readonly confirmDisabled?: boolean;
    /**
     * Which button to focus on mount of the component, if any.
     */
    readonly focusOnMount?: 'cancel' | 'confirm' | undefined;
  }

  type Props = (ConfirmOnlyProps | CancelAndConfirmProps) & {
    readonly buttonsState?: 'default' | 'loading';
    /**
     * The text for the confirm button.
     */
    readonly confirmText: string;
    readonly modal: Modal;
  };

  const {
    buttonsState = 'default',
    cancelText,
    confirmDisabled = false,
    confirmText,
    focusOnMount,
    modal,
    ...rest
  }: Props = $props();

  let cancelButtonElement = $state<SvelteNullableBinding<HTMLElement>>(null);
  let confirmButtonElement = $state<SvelteNullableBinding<HTMLElement>>(null);

  const cancelDisabled = $derived<boolean>(
    (Object.hasOwn(rest, 'cancelDisabled')
      ? (rest as {readonly cancelDisabled: boolean}).cancelDisabled
      : false) ?? false,
  );

  /**
   * Depending on the {@link focusOnMountValue} parameter, focus the cancel button, the confirm
   * button, or none at all.
   */
  function focusButton(
    currentFocusOnMountValue: 'cancel' | 'confirm',
    currentCancelButtonElement: typeof cancelButtonElement,
    currentConfirmButtonElement: typeof confirmButtonElement,
  ): void {
    switch (currentFocusOnMountValue) {
      case 'cancel':
        currentCancelButtonElement?.focus();
        break;
      case 'confirm':
        currentConfirmButtonElement?.focus();
        break;
      default:
        unreachable(currentFocusOnMountValue);
    }
  }

  $effect(() => {
    if (focusOnMount !== undefined) {
      focusButton(focusOnMount, cancelButtonElement, confirmButtonElement);
    }
  });
</script>

<div class="footer">
  {#if cancelText !== undefined}
    <Button
      disabled={buttonsState === 'loading' || cancelDisabled === true}
      flavor="naked"
      onclick={modal.cancel}
      onelementready={(event) => {
        cancelButtonElement = event.element;
      }}
    >
      {cancelText}
    </Button>
  {/if}
  <Button
    disabled={buttonsState === 'loading' || confirmDisabled === true}
    flavor="filled"
    onclick={modal.confirm}
    onelementready={(event) => {
      confirmButtonElement = event.element;
    }}
  >
    <div class="confirm-button-content" data-button-state={buttonsState}>
      <div class="progress">
        <CircularProgress variant="indeterminate" color="white" />
      </div>
      <div class="label">
        {confirmText}
      </div>
    </div>
  </Button>
</div>

<style lang="scss">
  @use 'component' as *;

  .confirm-button-content {
    display: grid;

    .progress,
    .label {
      grid-row: 1;
      grid-column: 1;
    }

    .progress {
      display: none;
      height: rem(20px);
    }

    &[data-button-state='loading'] {
      .progress {
        display: block;
      }

      .label {
        opacity: 0.4;
      }
    }
  }

  .footer {
    padding: rem(16px);
    display: grid;
    grid-template: 'cancel ok' auto / 1fr auto;
    column-gap: rem(8px);
    justify-items: end;
  }
</style>
