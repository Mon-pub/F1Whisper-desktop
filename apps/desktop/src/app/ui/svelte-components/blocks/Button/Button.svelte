<script lang="ts">
  import {ensureError} from '@threema/ts-utils/meta/ensure-error';
  import type {Snippet} from 'svelte';
  import type {HTMLButtonAttributes} from 'svelte/elements';

  import {globals} from '~/app/globals';
  import CircularProgress from '~/app/ui/svelte-components/blocks/CircularProgress/CircularProgress.svelte';
  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import {AsyncLock} from '~/common/utils/lock';

  interface Props extends Omit<HTMLButtonAttributes, 'disabled' | 'onclick' | 'type'> {
    /**
     * Whether the button should be focused on mount (or the `<dialog>` that it is part of is
     * displayed).
     */
    readonly autofocus?: boolean;
    readonly children?: Snippet;
    /**
     * Whether the button is disabled.
     */
    readonly disabled?: boolean;
    /**
     * The desired button flavor.
     */
    readonly flavor: 'filled' | 'naked';
    readonly onclick?: ((event: MouseEvent) => void) | ((event: MouseEvent) => Promise<void>);
    readonly onelementready?: (event: {readonly element: HTMLElement}) => void;
    /**
     * The desired button size.
     */
    readonly size?: 'normal' | 'small';
  }

  const {
    autofocus = false,
    disabled = false,
    flavor,
    onelementready,
    size = 'normal',
    children,
    onclick,
    ...rest
  }: Props = $props();

  const log = globals.unwrap().uiLogging.logger('ui.component.button');

  let button = $state<SvelteNullableBinding<HTMLElement>>(null);
  let loading = $state<boolean>(false);

  const clickLock = new AsyncLock();

  /**
   * Change focus to this button.
   */
  export function focus(): void {
    if (!disabled) {
      button?.focus();
    }
  }

  $effect(() => {
    if (button !== null) {
      onelementready?.({element: button});
    }
  });

  function onclickWithAsyncLock(event: MouseEvent): void {
    if (onclick === undefined) {
      return;
    }

    clickLock
      .with(async () => {
        loading = true;
        await onclick(event);
        loading = false;
      })
      .catch((error: unknown) => {
        log.error('Could not call onclick() with AsyncLock: ', ensureError(error));
      });
  }
</script>

<!-- Disable `autofocus` warning, because we only use it where needed. For example, using it with
  `<dialog>` is a valid use case. -->
<!-- svelte-ignore a11y_autofocus -->
<button
  bind:this={button}
  {autofocus}
  data-flavor={flavor}
  data-size={size}
  type="button"
  {...rest}
  disabled={loading || disabled}
  onclick={onclickWithAsyncLock}
>
  {#if loading}
    <div class="progress">
      <CircularProgress
        variant="indeterminate"
        color={flavor === 'filled' ? 'current' : 'default'}
      />
    </div>
  {/if}

  {@render children?.()}
</button>

<style lang="scss">
  @use 'component' as *;

  $-vars: (
    border-color,
    background-color,
    text-color,
    background-color--hover,
    background-color--active,
    border-color--hover,
    border-color--focus,
    border-color--active,
    opacity--disabled
  );
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  $-vars-size: (padding, font-size);
  $-temp-vars-size: format-each($-vars-size, $prefix: --c-t-);

  button {
    @extend %neutral-input;

    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: rem(8px);

    font-size: var($-temp-vars-size, --c-t-font-size);
    padding: var($-temp-vars-size, --c-t-padding);
    border: rem(1px) solid var($-temp-vars, --c-t-border-color);
    border-radius: rem(8px);
    background-color: var($-temp-vars, --c-t-background-color);
    color: var($-temp-vars, --c-t-text-color);

    .progress {
      height: rem(20px);
      width: rem(20px);
    }

    &:not(:disabled) {
      cursor: pointer;

      &:hover {
        @include def-var(
          $-temp-vars,
          --c-t-background-color,
          var($-temp-vars, --c-t-background-color--hover)
        );

        border-color: var($-temp-vars, --c-t-border-color--hover);
      }

      &:focus-visible {
        @include def-var(
          $-temp-vars,
          --c-t-background-color,
          var($-temp-vars, --c-t-background-color--hover)
        );

        border-color: var($-temp-vars, --c-t-border-color--focus);
      }

      &:active {
        @include def-var(
          $-temp-vars,
          --c-t-background-color,
          var($-temp-vars, --c-t-background-color--active)
        );

        border-color: var($-temp-vars, --c-t-border-color--active);
      }
    }

    &:disabled {
      background-color: color-mix(
        in srgb,
        var($-temp-vars, --c-t-background-color) var($-temp-vars, --c-t-opacity--disabled),
        transparent
      );
      border-color: transparent;
      color: color-mix(
        in srgb,
        var($-temp-vars, --c-t-text-color) var($-temp-vars, --c-t-opacity--disabled),
        transparent
      );

      &:hover {
        cursor: not-allowed;
      }
    }
  }

  @include def-mapped-flavor-vars(
    $-temp-vars,
    map-get-req($config, button-flavors),
    $-vars,
    $set-prefix: --c-t-,
    $get-prefix: --c-button-
  );

  @include def-mapped-size-vars(
    $-temp-vars-size,
    map-get-req($config, button-sizes),
    $-vars-size,
    $set-prefix: --c-t-,
    $get-prefix: --c-button-
  );
</style>
