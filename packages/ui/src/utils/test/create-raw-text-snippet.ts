import {createRawSnippet, type Snippet} from 'svelte';

/**
 * Creates a Svelte snippet containing a `<span>` with the given text, for use in tests.
 *
 * `createRawSnippet` requires the render function to return a single HTML element (not a bare text
 * node, see: https://svelte.dev/e/invalid_raw_snippet_render), so this helper wraps the text in a
 * `<span>` to satisfy that constraint.
 */
export function createRawTextSnippet(text: string): Snippet {
    return createRawSnippet(() => ({render: () => `<span>${text}</span>`}));
}
