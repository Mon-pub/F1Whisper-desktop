<script lang="ts">
  import {ensureError} from '@threema/ts-utils/meta/ensure-error';
  import type {Snippet} from 'svelte';
  import type {HTMLButtonAttributes} from 'svelte/elements';

  import {globals} from '~/app/globals';
  import CircularProgress from '~/app/ui/svelte-components/blocks/CircularProgress/CircularProgress.svelte';
  import {AsyncLock} from '~/common/utils/lock';

  interface Props extends Omit<HTMLButtonAttributes, 'disabled' | 'onclick' | 'type'> {
    readonly children?: Snippet;
    readonly disabled?: boolean;
    /**
     * The desired button flavor.
     */
    readonly flavor: 'filled' | 'outlined' | 'naked' | 'overlay';
    readonly onclick?: ((event: MouseEvent) => void) | ((event: MouseEvent) => Promise<void>);
    readonly snippetOverlay?: Snippet;
  }

  const log = globals.unwrap().uiLogging.logger('ui.component.icon-button');
  const {children, disabled, flavor, snippetOverlay, onclick, ...rest}: Props = $props();
  const clickLock = new AsyncLock();

  let loading = $state<boolean>(false);

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

<template>
  <button
    data-flavor={flavor}
    {...rest}
    type="button"
    disabled={loading || disabled}
    onclick={onclickWithAsyncLock}
  >
    <div class="circle">
      {#if loading}
        <div class="progress">
          <CircularProgress
            variant="indeterminate"
            color={flavor === 'filled' ? 'current' : 'default'}
          />
        </div>
      {:else}
        <div class="icon">
          {@render children?.()}
        </div>
        {@render snippetOverlay?.()}
      {/if}
    </div>
  </button>
</template>

<style lang="scss">
  @use 'component' as *;

  $-vars: (
    background-color,
    border-color,
    icon-color,
    outer-background-color--hover,
    outer-background-color--focus,
    outer-background-color--active,
    outer-border-color--focus,
    opacity--disabled
  );
  $-temp-vars: format-each($-vars, $prefix: --c-t-);

  button {
    @extend %neutral-input;
    display: grid;
    place-items: center;
    border-radius: 50%;
    user-select: none;
    border: solid 1px transparent;
    padding: var(--c-icon-button-outer-padding, default);

    .circle {
      position: relative;
      display: grid;
      place-items: center;
      padding: var(--c-icon-button-padding, default);
      background-color: var($-temp-vars, --c-t-background-color);
      border: solid em(2px) var($-temp-vars, --c-t-border-color);
      border-radius: 50%;

      .progress {
        display: grid;
        place-items: center;
        height: var(--c-icon-button-icon-size, default);
        width: var(--c-icon-button-icon-size, default);
        color: var($-temp-vars, --c-t-icon-color);
      }

      .icon {
        display: grid;
        place-items: center;
        font-size: var(--c-icon-button-icon-size, default);
        color: var($-temp-vars, --c-t-icon-color);
      }
    }

    &:not(:disabled) {
      cursor: pointer;

      &:hover {
        background-color: var($-temp-vars, --c-t-outer-background-color--hover);
      }

      &:focus-visible {
        background-color: var($-temp-vars, --c-t-outer-background-color--focus);
        border: solid em(1px) var($-temp-vars, --c-t-outer-border-color--focus);
      }

      &:active {
        background-color: var($-temp-vars, --c-t-outer-background-color--active);
      }
    }

    // Disabled state
    &:disabled {
      opacity: var($-temp-vars, --c-t-opacity--disabled);
    }
  }

  @include def-mapped-flavor-vars(
    $-temp-vars,
    map-get-req($config, icon-button-flavors),
    $-vars,
    $set-prefix: --c-t-,
    $get-prefix: --c-icon-button-
  );
</style>
