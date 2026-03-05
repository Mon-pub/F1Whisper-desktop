<script lang="ts" module>
  import type {HTMLAnchorAttributes, HTMLButtonAttributes} from 'svelte/elements';
  import {type VariantProps, cn, tv} from 'tailwind-variants';

  import type {WithChildren, WithoutChildren} from '../../utils/children';
  import type {WithElementRef} from '../../utils/element';

  export const buttonVariants = tv({
    slots: {
      root: 'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-base font-normal whitespace-nowrap transition-all outline-none select-none hover:cursor-pointer disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
      /**
       * Icon element rendered to the left of the button content. Includes base icon-font rendering
       * utilities; the `iconStyle` variant adds the correct `font-family`.
       */
      icon: 'inline-block shrink-0 text-[1lh] leading-none font-normal not-italic antialiased',
    },
    variants: {
      iconStyle: {
        'material-outlined': {icon: 'font-icon-material-outlined'},
        'threema-filled': {icon: 'font-icon-threema-filled'},
        'threema-outlined': {icon: 'font-icon-threema-outlined'},
      },
      size: {
        default: {
          root: 'px-6 py-2',
        },
      },
      variant: {
        primary: {
          root: 'border border-primary-800 bg-primary-800 text-white hover:bg-primary-900 focus-visible:border-black dark:bg-primary-500 dark:text-grey-900 dark:hover:bg-primary-400 dark:active:bg-primary-500',
        },
        secondary: {
          root: 'border border-transparent bg-transparent text-primary-800 hover:bg-black/5 focus-visible:border-black active:bg-black/10 dark:text-primary-500',
        },
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  });

  export type ButtonIconStyle = VariantProps<typeof buttonVariants>['iconStyle'];
  export type ButtonSize = VariantProps<typeof buttonVariants>['size'];
  export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];

  type BaseProps = WithElementRef<
    WithChildren<{
      readonly iconLeft?: string;
      readonly iconStyle?: ButtonIconStyle;
      readonly size?: ButtonSize;
      readonly variant?: ButtonVariant;
    }>
  >;

  type AnchorElementProps = BaseProps &
    WithoutChildren<Omit<HTMLAnchorAttributes, 'href' | 'onclick' | 'on:click' | 'type'>> & {
      readonly 'disabled'?: HTMLButtonAttributes['disabled'];
      readonly 'href': HTMLAnchorAttributes['href'];
      /**
       * Do not use `onclick` for links.
       */
      readonly 'onclick'?: never;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      readonly 'on:click'?: never;
      readonly 'type'?: never;
    };

  type AwaitableMouseEventHandler = (
    event: MouseEvent & {readonly currentTarget: EventTarget & HTMLButtonElement},
  ) => // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any | Promise<any>;

  type ButtonElementProps = BaseProps &
    WithoutChildren<Omit<HTMLButtonAttributes, 'href' | 'onclick' | 'on:click' | 'type'>> & {
      readonly 'disabled'?: HTMLButtonAttributes['disabled'];
      readonly 'href'?: never;
      /**
       * Callback to call when the button is triggered. Note: If a `Promise` is passed, the button
       * will be disabled and display a loading state until the promise is resolved as soon as it
       * has been triggered.
       */
      readonly 'onclick'?: AwaitableMouseEventHandler;
      // eslint-disable-next-line @typescript-eslint/naming-convention
      readonly 'on:click'?: never;
      readonly 'type'?: HTMLButtonAttributes['type'];
    };

  export type ButtonProps = AnchorElementProps | ButtonElementProps;
</script>

<script lang="ts">
  import {isPromise} from '@threema/ts-utils/promise/is-promise';

  import Spinner from '../spinner/Spinner.svelte';

  let {
    children,
    class: className,
    disabled = false,
    href,
    iconLeft,
    iconStyle,
    onclick,
    ref = $bindable(null),
    size = 'default',
    type,
    variant = 'primary',
    ...restProps
  }: ButtonProps = $props();

  const elementType = $derived(href === undefined || href === null ? 'button' : 'a');

  let isLoading = $state<boolean>(false);
  const isDisabled = $derived(disabled === true || isLoading);

  const slots = $derived(buttonVariants({variant, size, iconStyle}));

  /**
   * Synchronous handler for click events on a `HTMLButtonElement`. If the `onclick` prop is an
   * async function, `isLoading` will be set to `true` until the returned `Promise` is resolved.
   */
  function handleOnClick(
    event: MouseEvent & {readonly currentTarget: EventTarget & HTMLElement},
  ): void {
    if (
      // Ignore the click event if no handler was passed.
      onclick === undefined ||
      // Ignore the click event if the button is disabled or in a loading state.
      isDisabled ||
      isLoading ||
      // We only expect to receive click events if the element is a `HTMLButtonElement`.
      !(event.currentTarget instanceof HTMLButtonElement)
    ) {
      return;
    }

    event.preventDefault();

    // Cast necessary because TypeScript doesn't narrow the type of `currentTarget`.
    const result = onclick(event as MouseEvent & {currentTarget: EventTarget & HTMLButtonElement});
    if (isPromise(result)) {
      isLoading = true;
      result
        .catch((error) => {
          // TODO(DESK-2092): Implement logging.
        })
        .finally(() => {
          isLoading = false;
        });
    }
  }
</script>

<svelte:element
  this={elementType}
  bind:this={ref}
  aria-disabled={elementType === 'a' ? isDisabled : undefined}
  class={slots.root({class: cn(iconLeft !== undefined && 'pl-4', className)})}
  disabled={elementType === 'a' ? undefined : isDisabled}
  href={elementType === 'a' && !isDisabled ? href : undefined}
  onclick={elementType === 'a' ? undefined : handleOnClick}
  role={elementType === 'a' && isDisabled ? 'link' : undefined}
  tabindex={elementType === 'a' && isDisabled ? -1 : 0}
  type={elementType === 'a' ? undefined : type}
  {...restProps}
>
  {#if iconLeft !== undefined}
    {#if isLoading}
      <!--
        Replace the icon with a same-size spinner during loading so the button layout does not
        shift. Set its size to match the line-height of the button text.
      -->
      <Spinner class="size-[1lh]" />
    {:else}
      <span class={slots.icon()}>{iconLeft}</span>
    {/if}
  {/if}
  {@render children?.()}
</svelte:element>
