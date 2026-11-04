import type {u53} from '@threema/ts-utils/integer/u53';
import {assert} from '@threema/ts-utils/meta/assert';
import {
    createRawSnippet,
    flushSync,
    getAllContexts,
    mount,
    unmount,
    type MountOptions,
} from 'svelte';
import {describe, expect, it, vi, type MockedFunction} from 'vitest';
import {render} from 'vitest-browser-svelte';

import {captureElementScreenshot} from '../../utils/test/capture-element-screenshot';

import Charm, {type CharmProps} from './Charm.svelte';
import CharmsProvider from './CharmsProvider.svelte';
import type {CharmsRegistryContext} from './context';

/**
 * Render a {@link CharmsProvider} of `48px` (i.e. `size-12`), and wrap the registry it shares with
 * its charms in a spy, so that a test can observe what they register with it.
 */
function renderCharmsProvider(): {
    /** The context the provider shares with its charms. */
    readonly context: Map<symbol, CharmsRegistryContext>;
    /** The provider's container, i.e. the element its charms are placed in. */
    readonly element: HTMLElement;
    /** The element the provider masks, i.e. the one its charms are cut out of. */
    readonly masked: HTMLElement;
    readonly registry: {
        readonly [Key in keyof CharmsRegistryContext]: MockedFunction<CharmsRegistryContext[Key]>;
    };
} {
    let context: Map<symbol, CharmsRegistryContext> | undefined;

    const {container} = render(CharmsProvider, {
        class: 'size-12',
        children: createRawSnippet(() => ({
            render: () => '<span class="block size-full bg-grey-200"></span>',
            setup: () => {
                context = getAllContexts<Map<symbol, CharmsRegistryContext>>();
            },
        })),
    });

    // The provider shares its registry, and nothing else. Wrap it with Vitest spies, so that we can
    // observe its behavior.
    assert(context !== undefined, 'Expected the provider to share its context');
    const [entry] = [...context.entries()];
    assert(entry !== undefined, 'Expected the provider to share its registry');
    const [key, provided] = entry;
    const registry = {
        register: vi.fn(provided.register),
        unregister: vi.fn(provided.unregister),
    };
    context.set(key, registry);

    const element = container.firstElementChild;
    assert(element instanceof HTMLElement, 'Expected the provider to render a container');
    const masked = element.firstElementChild;
    assert(masked instanceof HTMLElement, 'Expected the provider to mask its content');

    return {context, element, masked, registry};
}

/**
 * Mount a {@link Charm} with the given options, and return its element along with its unmount
 * function.
 *
 * Note: A `Charm` needs to be a child component of a `CharmsProvider`, which a test cannot express
 * in markup, so it is mounted into the provider's container with the provider's context instead.
 */
function mountCharm({target, ...options}: MountOptions<CharmProps>): {
    readonly element: HTMLElement;
    readonly unmount: () => Promise<void>;
} {
    const charm = mount(Charm, {target, ...options});
    // The charm is mounted separately from the provider, so its effects (e.g. the measurement of
    // its size) are applied in a later flush.
    flushSync();

    assert(target instanceof Element, 'Expected the charm to be mounted into an element');
    const element = target.lastElementChild;
    assert(element instanceof HTMLElement, 'Expected the charm to be mounted into the target');

    return {
        element,
        unmount: async () => {
            await unmount(charm, {outro: false});
            flushSync();
        },
    };
}

describe('CharmsProvider.svelte', () => {
    describe('charms', () => {
        it('registers a charm rendered inside it', () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act
            mountCharm({
                context: provider.context,
                props: {
                    children: createRawSnippet(() => ({
                        render: () => '<span class="block size-4"></span>',
                    })),
                    position: {type: 'radial', degrees: 45},
                },
                target: provider.element,
            });

            // Assert: The charm registered its props, along with its measured size.
            expect(provider.registry.register).toHaveBeenCalledTimes(1);
            expect(provider.registry.register.mock.lastCall?.[1]).toEqual({
                gapPx: 2,
                position: {type: 'radial', degrees: 45},
                sizePx: {width: 16, height: 16},
            });
        });

        it('unregisters a charm which is destroyed', async () => {
            // Arrange
            const provider = renderCharmsProvider();
            const charm = mountCharm({
                context: provider.context,
                props: {position: {type: 'radial', degrees: 45}},
                target: provider.element,
            });
            const id = provider.registry.register.mock.lastCall?.[0];

            // Act
            await charm.unmount();

            // Assert
            expect(provider.registry.unregister).toHaveBeenCalledTimes(1);
            expect(provider.registry.unregister).toHaveBeenCalledWith(id);
        });

        it('registers and renders multiple charms', () => {
            // Arrange
            const provider = renderCharmsProvider();
            const children = createRawSnippet(() => ({
                render: () => '<span class="block size-4"></span>',
            }));

            // Act
            const first = mountCharm({
                context: provider.context,
                props: {children, position: {type: 'relative', x: 25, y: 25}},
                target: provider.element,
            });
            const second = mountCharm({
                context: provider.context,
                props: {children, position: {type: 'relative', x: 75, y: 75}},
                target: provider.element,
            });

            // Assert
            expect(provider.registry.register).toHaveBeenCalledTimes(2);
            expect(provider.element).toContainElement(first.element);
            expect(provider.element).toContainElement(second.element);
        });

        it('throws if a charm is rendered outside of a `CharmsProvider`', () => {
            // Act
            function renderCharmWithoutProvider(): unknown {
                return render(Charm, {position: {type: 'radial', degrees: 45}});
            }

            // Assert
            expect(renderCharmWithoutProvider).toThrow(
                'A `Charm` must be rendered as a child of a `CharmsProvider`',
            );
        });

        it('places a charm at its requested position', () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act: A charm of `16px` at 75% / 25% of the `48px` provider, i.e. centered on (36,
            // 12).
            const charm = mountCharm({
                context: provider.context,
                props: {
                    children: createRawSnippet(() => ({
                        render: () => '<span class="block size-4"></span>',
                    })),
                    position: {type: 'relative', x: 75, y: 25},
                },
                target: provider.element,
            });

            // Assert
            const providerRect = provider.masked.getBoundingClientRect();
            const charmRect = charm.element.getBoundingClientRect();
            expect(charmRect.x + charmRect.width / 2 - providerRect.x).toBe(36);
            expect(charmRect.y + charmRect.height / 2 - providerRect.y).toBe(12);
        });
    });

    describe('cutouts', () => {
        it('cuts out the content where the charm is placed', async () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act: A charm of `16px` at 75% / 25% of the `48px` provider, i.e. centered on (36,
            // 12).
            mountCharm({
                context: provider.context,
                props: {
                    children: createRawSnippet(() => ({
                        render: () => '<span class="block size-4"></span>',
                    })),
                    position: {type: 'relative', x: 75, y: 25},
                },
                target: provider.element,
            });

            // Assert: The content is fully transparent where the charm is, and fully opaque at the
            // mirrored position.
            const {data, width} = await captureElementScreenshot(provider.masked);
            function alphaAt(x: u53, y: u53): u53 {
                return data[(y * width + x) * 4 + 3] ?? 0;
            }
            expect(alphaAt(36, 12)).toBe(0);
            expect(alphaAt(12, 36)).toBe(255);
        });

        it('sizes the cutout of a charm by the charm plus its gap on either side', () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act: A charm of `24px`, with a gap of `4px`.
            mountCharm({
                context: provider.context,
                props: {
                    children: createRawSnippet(() => ({
                        render: () => '<span class="block size-6"></span>',
                    })),
                    gapPx: 4,
                    position: {type: 'radial', degrees: 45},
                },
                target: provider.element,
            });

            // Assert
            expect(getComputedStyle(provider.masked).maskImage).toContain(
                `radial-gradient(${(24 + 4 * 2) / 2}px at `,
            );
        });

        it('sizes the cutout of a charm which is not square by its larger side', () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act: A charm of `32px` by `8px`, with the default gap of `2px`.
            mountCharm({
                context: provider.context,
                props: {
                    children: createRawSnippet(() => ({
                        render: () => '<span class="block h-2 w-8"></span>',
                    })),
                    position: {type: 'radial', degrees: 45},
                },
                target: provider.element,
            });

            // Assert: The cutout is a circle, so it needs to cover the charm's larger side.
            expect(getComputedStyle(provider.masked).maskImage).toContain(
                `radial-gradient(${(32 + 2 * 2) / 2}px at `,
            );
        });

        it('does not cut out a charm without a gap', () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act
            const charm = mountCharm({
                context: provider.context,
                props: {
                    children: createRawSnippet(() => ({
                        render: () => '<span class="block size-4"></span>',
                    })),
                    gapPx: 0,
                    position: {type: 'radial', degrees: 45},
                },
                target: provider.element,
            });

            // Assert: The charm is drawn on top of the content instead.
            expect(getComputedStyle(provider.masked).maskImage).toBe('none');
            expect(charm.element).toBeInTheDocument();
        });

        it('does not cut out a charm without a size', () => {
            // Arrange
            const provider = renderCharmsProvider();

            // Act
            const charm = mountCharm({
                context: provider.context,
                props: {position: {type: 'radial', degrees: 45}},
                target: provider.element,
            });

            // Assert
            expect(getComputedStyle(provider.masked).maskImage).toBe('none');
            expect(charm.element).toBeInTheDocument();
        });
    });
});
