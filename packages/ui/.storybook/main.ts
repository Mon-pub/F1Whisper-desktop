import type {StorybookConfig} from '@storybook/svelte-vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
    core: {
        disableTelemetry: true,
        disableWhatsNewNotifications: true,
    },
    addons: [
        {
            name: '@storybook/addon-svelte-csf',
            options: {
                legacyTemplate: false,
            },
        },
    ],
    features: {
        sidebarOnboardingChecklist: false,
    },
    framework: {
        name: '@storybook/svelte-vite',
        options: {},
    },
    stories: ['../src/**/*.stories.svelte'],
    // Storybook creates its own Vite instance and does not pick up vitest.config.ts, so we must
    // explicitly register both plugins in the correct order (Tailwind must come before Svelte).
    viteFinal(existingConfig) {
        return {
            ...existingConfig,
            plugins: [
                // Tailwind must come before the Svelte plugin.
                tailwindcss(),
                svelte({
                    dynamicCompileOptions({filename}) {
                        // `svelte.config.js` sets `runes: true` globally, but
                        // `@storybook/addon-svelte-csf`'s `LegacyTemplate.svelte` still uses
                        // `export let`. Setting runes to `undefined` restores the default
                        // auto-detect behaviour for those files.
                        if (filename.includes('node_modules/@storybook/addon-svelte-csf')) {
                            return {runes: undefined};
                        }

                        return undefined;
                    },
                }),
                ...(existingConfig.plugins ?? []),
            ],
            optimizeDeps: {
                ...(existingConfig.optimizeDeps ?? {}),
                exclude: ['@threema/dom', ...(existingConfig.optimizeDeps?.exclude ?? [])],
            },
        };
    },
};

// eslint-disable-next-line import/no-default-export
export default config;
