import type {TransitionConfig} from 'svelte/transition';

/**
 * A custom, CSP-safe, Svelte fade-in/-out transition.
 */
// eslint-disable-next-line func-style, func-names
export const fade = function (
    node: HTMLElement,
    config?: Omit<TransitionConfig, 'css' | 'tick'>,
): TransitionConfig {
    const opacity = +getComputedStyle(node).opacity;

    return {
        ...config,
        tick: (t, u) => {
            node.style.setProperty('opacity', `${t * opacity}`);
        },
    };
};
