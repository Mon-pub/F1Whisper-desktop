import preprocess from './config/svelte.config.js';

/**
 * Warnings emitted by the Svelte compiler that should be suppressed globally.
 */
const IGNORED_COMPILER_WARNINGS = [
    // TODO(DESK-2124): Fix the affected components, then remove this.
    'state_referenced_locally',
];

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
    // See: https://svelte.dev/docs#svelte_compile.
    compilerOptions: {
        runes: true,
        // Note: This filter is applied by everything that runs the Svelte compiler with this
        // config, i.e. by `vite-plugin-svelte` and by `svelte-check`. It is _not_ applied by the
        // `svelte/valid-compile` ESLint rule, which compiles with its own options and instead
        // filters the resulting warnings through the `onwarn` handler below.
        warningFilter: (warning) => !IGNORED_COMPILER_WARNINGS.includes(warning.code),
    },
    preprocess: preprocess(),
    // Note: This handler is used by `vite-plugin-svelte` and by the `svelte/valid-compile` ESLint
    // rule, but not by `svelte-check`, which only honors `compilerOptions.warningFilter` above.
    onwarn(warning, defaultHandler) {
        // TODO(DESK-1714): Investigate this warning. Note: It is emitted by `vite-plugin-svelte`
        // itself rather than by the compiler, so it cannot be suppressed with `warningFilter`.
        if (warning.code === 'vite-plugin-svelte-preprocess-many-dependencies') {
            return;
        }
        if (IGNORED_COMPILER_WARNINGS.includes(warning.code)) {
            return;
        }
        defaultHandler(warning);
    },
};
