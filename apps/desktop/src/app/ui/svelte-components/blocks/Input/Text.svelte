<script lang="ts">
  import {tick} from 'svelte';
  import type {HTMLInputAttributes} from 'svelte/elements';

  import type {SvelteNullableBinding} from '~/app/ui/utils/svelte';
  import type {u53} from '~/common/types';
  import {assertUnreachable} from '~/common/utils/assert';

  interface Props
    extends Pick<HTMLInputAttributes, 'oninput' | 'onkeydown' | 'onkeyup' | 'onpaste'> {
    /**
     * Determinate if input can be changed by the user.
     */
    readonly disabled?: boolean;
    /**
     * May occurred error description.
     */
    readonly error?: string | undefined;
    /**
     * Any helping description.
     */
    readonly help?: string | undefined;
    /**
     * The hinting label of the Input element.
     */
    readonly label?: string | undefined;
    /**
     * Define the max char length of the input.
     */
    readonly maxlength?: u53 | undefined;
    /**
     * Determinate if input should be, if possible, checked for spelling errors.
     */
    readonly spellcheck?: boolean;
    /**
     * Optional function to transform the bindable `value` before reading and writing.
     */
    readonly transform?: (value: string) => string;
    /**
     * The user input.
     */
    readonly value: string;
  }

  let {
    disabled = false,
    error,
    help,
    label,
    oninput,
    onkeydown,
    onkeyup,
    onpaste,
    maxlength,
    spellcheck = true,
    transform = (value) => value,
    value = $bindable(),
  }: Props = $props();

  // The raw text input element.
  let input = $state<SvelteNullableBinding<HTMLInputElement>>(null);

  // Defines if the raw text input element will be shown.
  let showInput = $derived<boolean>(
    value !== '' || document.activeElement === input || label === undefined,
  );

  /**
   * Change focus to this text input.
   */
  export function focus(): void {
    if (!disabled) {
      showInput = true;
      tick()
        .then(() => input?.focus())
        .catch(assertUnreachable);
    }
  }
</script>

<div class="container" data-error={error !== undefined}>
  <!-- Because `<input>` can be focused via keyboard anyway, a11y should not be handled here. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="input"
    data-label={label !== undefined}
    data-input={showInput}
    data-disabled={disabled}
    onclick={() => input?.focus()}
  >
    <!-- See comment above. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <label onmousedown={focus}>
      <span>{label}</span>
      <input
        bind:this={input}
        {disabled}
        {maxlength}
        onblur={() => {
          if (!disabled) {
            showInput = label === undefined || value !== '';
          }
        }}
        onfocus={() => {
          if (!disabled) {
            showInput = true;
          }
        }}
        oninput={(event) => {
          oninput?.(event);
          value = transform(event.currentTarget.value);
        }}
        {onkeydown}
        {onkeyup}
        {onpaste}
        placeholder={label}
        {spellcheck}
        type="text"
        value={transform(value)}
      />
    </label>
  </div>
  {#if error !== undefined || help !== undefined}
    <div class="text">
      {#if error !== undefined}
        {error}
      {:else}
        {help}
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  @use 'component' as *;

  .container {
    display: grid;
    grid-template:
      'input' auto
      'text' auto
      / auto;
    row-gap: em(4px);

    .input {
      grid-area: input;
      padding: em(9px) em(16px);
      border-radius: var(--c-input-text-border-radius);
      background-color: var(--c-input-text-background-color);
      border-style: solid;
      border-width: em(1px);
      border-color: transparent;
      cursor: text;

      &:hover {
        background-color: var(--c-input-text-background-color--hover);
      }

      &:focus-within {
        background-color: var(--c-input-text-background-color--active);
      }

      label {
        @extend %font-small-400;
        display: grid;
        grid-template:
          'label' auto
          'value' auto
          / auto;
        color: var(--c-input-text-label-color);

        span {
          grid-area: label;
          user-select: none;
          cursor: text;
        }

        input {
          @extend %font-normal-400;
          width: 100%;
          color: var(--c-input-text-input-color);
          grid-area: value;
          border: none;
          outline: none;
          background-color: transparent;
          padding: 0;
          margin-top: em(-2px);
          text-align: var(--c-input-text-input-text-align);
          letter-spacing: var(--c-input-text-input-letter-spacing);

          &::placeholder {
            color: transparent;
          }
        }
      }

      &[data-input='false'] {
        padding: em(17px) em(16px);

        label {
          @extend %font-normal-400;
          grid-template:
            'label' auto
            / 100%;
          grid-area: label;
          position: relative;
          cursor: text;

          input {
            opacity: 0;
            position: absolute;
            top: 0;
            left: 0;
            width: 0;
            height: 0;
          }
        }
      }

      &[data-label='false'] {
        padding: em(17px) em(16px);

        label {
          span {
            display: none;
          }
          input {
            margin-top: 0;
          }
        }
      }

      &[data-disabled='true'] {
        background-color: var(--c-input-text-background-color--disabled) !important;

        label {
          color: var(--c-input-text-label-color--disabled);
          cursor: default;

          span {
            cursor: default;
          }

          input {
            color: var(--c-input-text-input-color--disabled);
          }
        }
      }
    }

    .text {
      @extend %font-small-400;
      grid-area: text;
      color: var(--c-input-text-help-color);
    }

    &[data-error='true'] {
      .input {
        border-color: var(--c-input-text-error-color);
      }
      .text {
        color: var(--c-input-text-error-color);
      }
    }
  }
</style>
