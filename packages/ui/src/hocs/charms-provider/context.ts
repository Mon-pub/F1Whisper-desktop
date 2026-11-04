import type {u53} from '@threema/ts-utils/integer/u53';
import {assert} from '@threema/ts-utils/meta/assert';
import {getContext, setContext} from 'svelte';

import type {CharmProps} from './Charm.svelte';

/**
 * Everything a `CharmsProvider` needs to know about one of its charms in order to place it
 * correctly. Note: The properties are read lazily, i.e. an implementation is expected to expose
 * them as getters, so that the provider keeps track of changes to the charm's props.
 */
export type CharmRegistration = Required<Pick<CharmProps, 'gapPx' | 'position'>> & {
    /**
     * Rendered size of the charm, in pixels, or `undefined` if it has not been measured yet.
     */
    readonly sizePx:
        | {
              readonly height: u53;
              readonly width: u53;
          }
        | undefined;
};

/**
 * Registry a `CharmsProvider` shares with its charms via context. Charms use it to announce
 * themselves to the provider, which in turn cuts them out of the content it wraps.
 */
export interface CharmsRegistryContext {
    readonly register: (id: symbol, registration: CharmRegistration) => void;
    readonly unregister: (id: symbol) => void;
}

const CONTEXT_KEY = Symbol('charms');

/**
 * Share the given charm registry with all descendants of the current component.
 */
export function setCharmsRegistryContext(context: CharmsRegistryContext): void {
    setContext(CONTEXT_KEY, context);
}

/**
 * Get the charm registry shared by the closest `CharmsProvider` ancestor.
 *
 * @throws {Error} If the current component is not rendered inside a `CharmsProvider`.
 */
export function getCharmsRegistryContext(): CharmsRegistryContext {
    const context = getContext<CharmsRegistryContext | undefined>(CONTEXT_KEY);
    assert(context !== undefined, 'A `Charm` must be rendered as a child of a `CharmsProvider`');

    return context;
}
